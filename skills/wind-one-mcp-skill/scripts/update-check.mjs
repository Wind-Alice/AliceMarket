#!/usr/bin/env node
// Daily Git updater for the Search / Call Skill.

import {
  closeSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPackageLock } from './package-lock.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_MAIN = Boolean(process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH);
const HAS_TARGET_ARGUMENT = IS_MAIN && process.argv[2] && !process.argv[2].startsWith('--');
const SKILL_DIR = HAS_TARGET_ARGUMENT ? resolve(process.argv[2]) : dirname(dirname(SCRIPT_PATH));
const SKILL_NAME = basename(SKILL_DIR);
const REQUIRED_TRANSPORT = 'search-call-v1';
const autoUpdateEnabled = () => process.env.WIND_SKILL_AUTO_UPDATE !== '0';
const STATE_FILE = join(SKILL_DIR, 'scripts', 'update-state.json');
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const LOCK_FILE = join(CACHE_DIR, 'locks', `${createHash('sha256').update(normalized(SKILL_DIR)).digest('hex').slice(0, 24)}.lock`);
const UPDATE_SOURCE = 'https://github.com/Wind-Alice/AliceMarket.git';
const UPDATE_REF = 'main';
const UPDATE_SKILL_PATH = 'skills/wind-one-mcp-skill/SKILL.md';
const LOCK_STALE_MS = 30 * 60 * 1000;
const RETRY_BASE_MS = 30 * 60 * 1000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

function normalized(path) {
  const value = resolve(path).replace(/\\/g, '/');
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function updateScope() {
  const override = String(process.env.WIND_SKILL_INSTALL_SCOPE || '').trim().toLowerCase();
  if (override === 'global' || override === 'project') return override;
  const rel = relative(homedir(), SKILL_DIR).split(sep);
  return rel.length === 3 && rel[0].startsWith('.') && rel[1] === 'skills' ? 'global' : 'project';
}

function projectRoot() {
  return resolve(SKILL_DIR, '..', '..', '..');
}

function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function sameUpdateTarget(state) {
  return state?.source === UPDATE_SOURCE && state.ref === UPDATE_REF && state.skillPath === UPDATE_SKILL_PATH;
}

function retryPending(state = readState()) {
  return sameUpdateTarget(state) && state.status === 'failed' && Number.isFinite(Date.parse(state.nextRetryAt)) &&
    Date.now() < Date.parse(state.nextRetryAt);
}

function successfulToday(state = readState()) {
  return sameUpdateTarget(state) && state.date === todayKey() && state.status === 'success';
}

function skippedUpdate(force = false) {
  if (force) return null;
  const state = readState();
  const reason = !autoUpdateEnabled() ? 'auto_update_disabled'
    : successfulToday(state) ? 'already_checked_today'
    : retryPending(state) ? 'retry_pending' : null;
  return reason ? { status: 'skipped', reason, update_state: state } : null;
}

function writeState(patch) {
  const previous = readState() || {};
  const state = {
    ...previous, date: todayKey(), scope: updateScope(),
    failureCount: sameUpdateTarget(previous) ? previous.failureCount : 0,
    source: UPDATE_SOURCE, ref: UPDATE_REF, skillPath: UPDATE_SKILL_PATH,
    updatedAt: new Date().toISOString(), ...patch,
  };
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export function diagnoseUpdate() {
  const state = readState();
  return {
    update_scope: updateScope(), update_channel: 'wind_tools',
    update_method: 'git', required_update_transport: REQUIRED_TRANSPORT,
    auto_update: autoUpdateEnabled() ? 'enabled' : 'disabled',
    update_source: UPDATE_SOURCE, update_ref: UPDATE_REF, update_skill_path: UPDATE_SKILL_PATH,
    update_state_file: STATE_FILE,
    update_state: state, next_update_needed: autoUpdateEnabled() && !successfulToday(state) && !retryPending(state),
    skill_directory: SKILL_DIR,
    project_directory: updateScope() === 'global' ? null : projectRoot(),
  };
}

function createRunner() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const runnerDir = mkdtempSync(join(CACHE_DIR, 'runner-'));
  const runner = join(runnerDir, 'update-check.mjs');
  copyFileSync(join(SKILL_DIR, 'scripts', 'package-lock.mjs'), join(runnerDir, 'package-lock.mjs'));
  copyFileSync(SCRIPT_PATH, runner);
  return runner;
}

export function updateSkill({ force = false } = {}) {
  const runner = createRunner();
  const result = spawnSync(process.execPath,
    [runner, SKILL_DIR, ...(force ? ['--force'] : []), '--cleanup-runner'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
  if (result.error) {
    rmSync(dirname(runner), { recursive: true, force: true });
    throw result.error;
  }
  if (!result.stdout.trim()) throw new Error(result.stderr.trim() || `Update runner exited with status ${result.status}`);
  return JSON.parse(result.stdout);
}

export function triggerUpdateCheck() {
  try {
    if (skippedUpdate()) return;
    const runner = createRunner();
    const runnerDir = dirname(runner);
    const child = spawn(process.execPath, [runner, SKILL_DIR, '--cleanup-runner'], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.on('error', (error) => {
      try { rmSync(runnerDir, { recursive: true, force: true }); } catch {}
      try { markFailure(new Error(`Cannot start background updater: ${error.message}`)); } catch {}
    });
    child.unref();
  } catch (error) {
    try { markFailure(error); } catch {}
  }
}

function acquireLock() {
  mkdirSync(dirname(LOCK_FILE), { recursive: true });
  try {
    const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
    let owner = null;
    try { owner = JSON.parse(readFileSync(LOCK_FILE, 'utf8'))?.pid; } catch {}
    let ownerAlive = false;
    if (Number.isSafeInteger(owner) && owner > 0) {
      try { process.kill(owner, 0); ownerAlive = true; }
      catch (error) { ownerAlive = error?.code === 'EPERM'; }
    }
    if (!ownerAlive && (owner || age > LOCK_STALE_MS)) unlinkSync(LOCK_FILE);
  } catch {}
  let fd = null;
  try {
    fd = openSync(LOCK_FILE, 'wx');
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return fd;
  } catch {
    if (fd !== null) {
      try { closeSync(fd); } catch {}
      try { unlinkSync(LOCK_FILE); } catch {}
    }
    return null;
  }
}

function releaseLock(fd) {
  try { closeSync(fd); } catch {}
  try { unlinkSync(LOCK_FILE); } catch {}
}

function versionOf(dir) {
  const match = readFileSync(join(dir, 'scripts/mcp.mjs'), 'utf8')
    .match(/\bSKILL_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if (match) return match[1];
  throw new Error(`SKILL_VERSION missing in ${dir}`);
}

function validatePackage(dir) {
  for (const file of ['SKILL.md', 'scripts/cli.mjs', 'scripts/client.mjs', 'scripts/mcp.mjs', 'scripts/update-check.mjs', 'scripts/package-lock.mjs']) {
    const full = join(dir, file);
    if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`Incomplete Skill package: ${file}`);
  }
  const text = readFileSync(join(dir, 'scripts/mcp.mjs'), 'utf8');
  const transport = text.match(/export const SKILL_TRANSPORT = ['"]([^'"]+)['"];?/)?.[1];
  if (transport !== REQUIRED_TRANSPORT) {
    throw new Error(`Incompatible Skill transport: expected ${REQUIRED_TRANSPORT}, received ${transport || 'missing'}`);
  }
  const version = versionOf(dir);
  const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const metadata = skill.match(/^metadata:\r?\n((?:[ \t]+.*\r?\n)*)/m)?.[1] || '';
  const documentedVersion = metadata.match(/^\s+version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m)?.[1];
  if (documentedVersion !== version) {
    throw new Error(`Skill version mismatch: SKILL.md ${documentedVersion || 'missing'}, runtime ${version}`);
  }
  for (const file of packageFiles(dir).filter((file) => file.rel.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', file.full], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Invalid script ${file.rel}: ${(result.stderr || result.error?.message || '').trim()}`);
    }
  }
  return version;
}

function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

function packageFiles(dir) {
  const files = [];
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name);
      const rel = relative(dir, full).replace(/\\/g, '/');
      if (rel === 'config.json' || rel === 'scripts/update-state.json' || rel === 'scripts/update.lock') continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ full, rel });
    }
  }
  walk(dir);
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return files;
}

function packageHash(dir) {
  const hash = createHash('sha256');
  for (const file of packageFiles(dir)) {
    hash.update(file.rel); hash.update('\0'); hash.update(readFileSync(file.full)); hash.update('\0');
  }
  return hash.digest('hex');
}

function candidatePath(cloneDir) {
  return resolve(cloneDir, dirname(UPDATE_SKILL_PATH));
}

function cloneSource(dest) {
  const result = spawnSync('git', ['clone', '--branch', UPDATE_REF, '--depth', '1', '--quiet', '--', UPDATE_SOURCE, dest], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git clone failed: ${(result.stderr || result.error?.message || '').trim().slice(-500)}`);
  }
  const head = spawnSync('git', ['-C', dest, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  return head.status === 0 ? head.stdout.trim() : null;
}

function syncDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  const names = new Set();
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    names.add(entry.name);
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      if (existsSync(to) && !statSync(to).isDirectory()) rmSync(to, { force: true });
      syncDirectory(from, to);
    } else if (entry.isFile()) {
      if (existsSync(to) && statSync(to).isDirectory()) rmSync(to, { recursive: true });
      const temporary = `${to}.wind-update-${process.pid}.tmp`;
      copyFileSync(from, temporary);
      renameSync(temporary, to);
    } else {
      throw new Error(`Unsupported entry in Skill package: ${from}`);
    }
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (!names.has(entry.name)) rmSync(join(target, entry.name), { recursive: true, force: true });
  }
}

function recoverInterruptedUpdate() {
  const parent = dirname(SKILL_DIR);
  if (!existsSync(parent)) return;
  for (const name of readdirSync(parent)) {
    if (!name.startsWith(`.${SKILL_NAME}-update-`)) continue;
    const work = join(parent, name);
    const backup = join(work, 'old');
    if (!existsSync(join(work, 'restore-on-interruption')) || !existsSync(backup)) continue;
    syncDirectory(backup, SKILL_DIR);
    rmSync(work, { recursive: true, force: true });
  }
}

function replaceTarget(candidate, sourceHash) {
  const target = realpathSync(SKILL_DIR);
  const parent = dirname(target);
  const work = mkdtempSync(join(parent, `.${SKILL_NAME}-update-`));
  const staged = join(work, 'new');
  const backup = join(work, 'old');
  let safeToClean = false;
  try {
    cpSync(candidate, staged, { recursive: true });
    for (const rel of ['config.json', 'scripts/update-state.json']) {
      const oldFile = join(target, rel);
      if (existsSync(oldFile)) {
        mkdirSync(dirname(join(staged, rel)), { recursive: true });
        copyFileSync(oldFile, join(staged, rel));
      }
    }
    cpSync(target, backup, { recursive: true });
    writeFileSync(join(work, 'restore-on-interruption'), target);
    syncDirectory(staged, target);
    const afterHash = packageHash(target);
    if (afterHash !== sourceHash) {
      throw new Error('Installed directory failed post-update verification');
    }
    safeToClean = true;
    return afterHash;
  } catch (error) {
    if (existsSync(join(work, 'restore-on-interruption'))) {
      try {
        syncDirectory(backup, target);
        safeToClean = true;
      } catch (restoreError) {
        throw new Error(`Update failed: ${error.message}; restore failed: ${restoreError.message}`);
      }
    }
    throw error;
  } finally {
    if (safeToClean) rmSync(work, { recursive: true, force: true });
  }
}

function markFailure(error) {
  const previous = readState();
  const count = Math.min(5, (sameUpdateTarget(previous) ? Number(previous.failureCount) || 0 : 0) + 1);
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (count - 1));
  writeState({ status: 'failed', finishedAt: new Date().toISOString(),
    failureCount: count, nextRetryAt: new Date(Date.now() + delay).toISOString(),
    error: String(error?.message || error).slice(0, 4000), changed: false });
}

async function runUpdate() {
  await withPackageLock(SKILL_DIR, recoverInterruptedUpdate);
  const previous = versionOf(SKILL_DIR);
  const beforeHash = packageHash(SKILL_DIR);
  const fetchDir = mkdtempSync(join(tmpdir(), 'wind-skill-fetch-'));
  try {
    const cloneDir = join(fetchDir, 'repo');
    const head = cloneSource(cloneDir);
    const candidate = candidatePath(cloneDir);
    const next = validatePackage(candidate);
    if (compareVersions(next, previous) < 0) {
      throw new Error(`Downgrade blocked: installed ${previous}, source offers ${next}`);
    }
    const sourceHash = packageHash(candidate);
    const changed = sourceHash !== beforeHash;
    await withPackageLock(SKILL_DIR, () => {
      const afterHash = changed ? replaceTarget(candidate, sourceHash) : packageHash(SKILL_DIR);
      if (afterHash !== sourceHash) {
        throw new Error('Loaded Skill directory does not match downloaded source');
      }
      writeState({ status: 'success', finishedAt: new Date().toISOString(),
        failureCount: 0, nextRetryAt: null, error: null, changed,
        previousVersion: previous, installedVersion: next,
        remoteHead: head, lastAppliedRemoteHead: head,
        beforeHash, afterHash, method: 'verified-git-clone' });
    });
  } finally {
    rmSync(fetchDir, { recursive: true, force: true });
  }
}

async function main() {
  const flags = process.argv.slice(HAS_TARGET_ARGUMENT ? 3 : 2);
  if (flags.some(flag => !['--force', '--cleanup-runner'].includes(flag)) || new Set(flags).size !== flags.length) {
    const error = new Error('Usage: update-check.mjs [skillDir] [--force]');
    error.code = 'USAGE_ERROR';
    throw error;
  }
  const force = flags.includes('--force');
  const skipped = skippedUpdate(force);
  if (skipped) return skipped;
  const fd = acquireLock();
  if (fd === null) return { status: 'skipped', reason: 'update_in_progress', update_state: readState() };
  try {
    const skipped = skippedUpdate(force);
    if (skipped) return skipped;
    writeState({ status: 'updating', startedAt: new Date().toISOString(), changed: false });
    await runUpdate();
    return readState();
  } finally {
    releaseLock(fd);
  }
}

if (IS_MAIN) {
  const writeResult = result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  main().then(writeResult).catch(error => {
    process.exitCode = 1;
    if (error.code === 'USAGE_ERROR') {
      writeResult({ status: 'failed', code: error.code, error: error.message });
    } else {
      markFailure(error);
      writeResult(readState());
    }
  }).finally(() => {
    const runnerDir = dirname(SCRIPT_PATH);
    if (process.argv.includes('--cleanup-runner') &&
        normalized(dirname(runnerDir)) === normalized(CACHE_DIR) &&
        basename(runnerDir).startsWith('runner-')) {
      try { rmSync(runnerDir, { recursive: true, force: true }); } catch {}
    }
  });
}
