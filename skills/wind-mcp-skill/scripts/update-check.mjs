#!/usr/bin/env node
// 每日后台自动更新，分两部分：
//   共享部分（cli.mjs 复用）：触发、状态读写、诊断。无网络、无子进程副作用。
//   执行部分（仅直接运行本脚本时）：加锁、等待静默窗口、npx skills update / add、记录结果。
// 本文件必须自包含（零相对 import）：cli.mjs 把它复制到缓存目录后独立运行，这样 skill 目录被
// 整体替换时脚本不会消失；缓存副本运行结束后自行删除。
import {
  closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUNNER_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const DEFAULT_SOURCES = [
  'Wind-Information-Co-Ltd/wind-skills',
  'git@gitee.com:wind_info/wind-skills.git',
];
const LOCK_STALE_MS = 30 * 60 * 1000;
const QUIET_MS = 10 * 1000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const HASH_EXCLUDES = new Set(['config.json', 'scripts/update-state.json', 'scripts/update.lock']);

// ---------- 共享部分 ----------

export function normalizePath(value) {
  const normalized = resolve(value).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

// 更新范围：env 显式指定优先；否则按 skillDir 实际位置自检——
// 只有目录真的位于 ~/.agents/skills 下才算 global，项目内安装一律按 project。诊断与执行共用。
export function installScope(skillDir = SKILL_DIR) {
  const override = String(process.env.WIND_SKILL_INSTALL_SCOPE || '').trim().toLowerCase();
  if (override === 'project' || override === 'global') return override;
  const globalRoot = normalizePath(join(homedir(), '.agents', 'skills'));
  return normalizePath(skillDir).startsWith(`${globalRoot}/`) ? 'global' : 'project';
}

export function updateStateFile(skillDir) {
  return join(skillDir, 'scripts', 'update-state.json');
}

export function readUpdateState(skillDir) {
  try {
    const file = updateStateFile(skillDir);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

export function writeUpdateStatePatch(skillDir, patch) {
  const file = updateStateFile(skillDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...(readUpdateState(skillDir) || {}), ...patch }, null, 2) + '\n');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// 只看状态文件，不发网络。
export function updatedToday(state) {
  return Boolean(state && state.date === todayKey() && state.status === 'success');
}

// call 成功后触发：当天未成功更新时记录使用时间，把本脚本复制到缓存目录后 detached 运行。
// WIND_SKILL_AUTO_UPDATE=0 时不写状态、不复制、不启动子进程。更新失败只记状态，绝不阻塞数据调用。
export function triggerUpdateCheck(skillDir) {
  try {
    if (process.env.WIND_SKILL_AUTO_UPDATE === '0') return;
    const script = join(skillDir, 'scripts', 'update-check.mjs');
    if (!existsSync(script)) return;
    if (updatedToday(readUpdateState(skillDir))) return;
    writeUpdateStatePatch(skillDir, { lastUsedAt: new Date().toISOString(), lastUsedPid: process.pid });
    mkdirSync(RUNNER_DIR, { recursive: true });
    const runner = join(RUNNER_DIR, `update-check-${basename(skillDir)}-${process.pid}.mjs`);
    copyFileSync(script, runner);
    const child = spawn('node', [runner, skillDir], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // 更新是尽力而为，任何失败都不影响数据调用。
  }
}

// 只读状态与范围，不发远端请求、不启动更新。
export function diagnoseUpdate(skillDir) {
  const file = updateStateFile(skillDir);
  let state = null;
  try {
    if (existsSync(file)) state = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    state = { status: 'unreadable' };
  }
  return {
    platform: process.platform,
    node_pid: process.pid,
    update_scope: installScope(skillDir),
    update_state_file: file,
    update_state: state,
    next_update_needed: !updatedToday(state),
  };
}

// ---------- 执行部分 ----------
// 直接运行时第 1 个参数是 Skill 目录；被 import 时不看 argv，导入方显式传 skillDir。

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const SKILL_DIR = IS_MAIN && process.argv[2] ? resolve(process.argv[2]) : dirname(dirname(SCRIPT_PATH));
const SKILL_NAME = basename(SKILL_DIR);
const LOCK_FILE = join(SKILL_DIR, 'scripts', 'update.lock');

function projectRoot() {
  return resolve(SKILL_DIR, '..', '..', '..');
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const path of paths.filter(Boolean).map((value) => resolve(value))) {
    const key = normalizePath(path);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

function withScopeFlag(command) {
  if (installScope() === 'global') command.push('-g');
  return command;
}

function updateCommand() {
  return withScopeFlag(['npx', 'skills', 'update', SKILL_NAME, '-y']);
}

function addCommandForSource(source) {
  return source ? withScopeFlag(['npx', 'skills', 'add', source, '--skill', SKILL_NAME, '-y']) : null;
}

// skills-lock.json 可能在项目根、当前目录、npm 启动目录或 skill 目录的任一上级。
function projectLockCandidates() {
  const roots = [projectRoot(), process.cwd(), process.env.INIT_CWD];
  for (let dir = resolve(SKILL_DIR); ; dir = dirname(dir)) {
    roots.push(dir);
    if (dirname(dir) === dir) break;
  }
  return uniquePaths(roots.filter(Boolean).map((root) => join(root, 'skills-lock.json')));
}

function globalLockCandidates() {
  const xdg = process.env.XDG_STATE_HOME;
  return uniquePaths([
    xdg ? join(xdg, 'skills', '.skill-lock.json') : null,
    join(homedir(), '.agents', '.skill-lock.json'),
  ]);
}

function lockFileCandidates() {
  const globalFiles = globalLockCandidates();
  const projectFiles = projectLockCandidates();
  return installScope() === 'global'
    ? uniquePaths([...globalFiles, ...projectFiles])
    : uniquePaths([...projectFiles, ...globalFiles]);
}

function readLockInfo() {
  const candidates = lockFileCandidates();
  let firstExisting = null;
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      firstExisting ||= file;
      const entry = JSON.parse(readFileSync(file, 'utf8'))?.skills?.[SKILL_NAME] || null;
      if (entry) return { file, entry, candidates };
    } catch {
      // 坏文件跳过，继续找下一个候选。
    }
  }
  return { file: firstExisting || candidates[0] || null, entry: null, candidates };
}

function readLockEntry() {
  return readLockInfo().entry;
}

function isGiteeSource(entry) {
  return [entry?.sourceType, entry?.source, entry?.sourceUrl]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes('gitee'));
}

function sourceUrl(entry) {
  if (!entry) return null;
  if (entry.sourceUrl) return entry.sourceUrl;
  const shorthand = /^[^/\s]+\/[^/\s]+$/.test(entry.source || '');
  if (entry.sourceType === 'github' && shorthand) return `https://github.com/${entry.source}.git`;
  if ((entry.sourceType === 'gitee' || entry.sourceType === 'git') && shorthand) return `https://gitee.com/${entry.source}.git`;
  return entry.source || null;
}

function remoteHead(entry) {
  const source = sourceUrl(entry);
  if (!source) return null;
  try {
    const result = spawnSync('git', ['ls-remote', source, 'HEAD'], {
      encoding: 'utf8',
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60 * 1000,
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    const head = (result.stdout || '').trim().split(/\s+/)[0];
    return /^[0-9a-f]{40}$/i.test(head) ? head : null;
  } catch {
    return null;
  }
}

// 兜底重装来源：lock 记录的来源、官方 GitHub、官方 Gitee，去重后依次尝试。
function fallbackAddCommands(entry) {
  const seen = new Set();
  return [sourceUrl(entry), ...DEFAULT_SOURCES]
    .filter(Boolean)
    .filter((source) => {
      const key = String(source).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(addCommandForSource)
    .filter(Boolean);
}

// Gitee 来源的 update 无法重新解析源，改用 add 覆盖安装。
function commandForUpdate() {
  const entry = readLockEntry();
  const sourceType = entry?.sourceType || null;
  if (isGiteeSource(entry)) {
    const command = addCommandForSource(sourceUrl(entry));
    if (command) return { command, method: 'add', sourceType };
  }
  return { command: updateCommand(), method: 'update', sourceType };
}

// 状态文件说今天已成功之后，再核对远端 HEAD 是否变过（会发起 git ls-remote，只在执行路径用）。
function alreadyUpdatedToday() {
  const state = readUpdateState(SKILL_DIR);
  if (!updatedToday(state)) return false;
  const entry = readLockEntry();
  if (!entry || isGiteeSource(entry)) return true;
  const head = remoteHead(entry);
  return !head || head === state.lastAppliedRemoteHead;
}

function lastUsedAt() {
  const timestamp = new Date(readUpdateState(SKILL_DIR)?.lastUsedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

// skill 最近 10 秒内还在被调用就继续等，最多等 10 分钟。
async function waitForQuietWindow() {
  const startedAt = Date.now();
  while (Date.now() - lastUsedAt() < QUIET_MS) {
    if (Date.now() - startedAt >= MAX_WAIT_MS) return false;
    await sleep(QUIET_MS);
  }
  return true;
}

function acquireLock() {
  try {
    mkdirSync(dirname(LOCK_FILE), { recursive: true });
    try {
      if (Date.now() - statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) unlinkSync(LOCK_FILE);
    } catch {
      // 没有旧锁。
    }
    return openSync(LOCK_FILE, 'wx');
  } catch {
    return null;
  }
}

function releaseLock(fd) {
  try {
    closeSync(fd);
  } catch {
    // 已关闭。
  }
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // 已删除。
  }
}

// 状态写入合并既有内容（保留 lastUsedAt/lastUsedPid 等），否则静默窗口判定失效。
function writeState(patch) {
  const { command, method, sourceType } = commandForUpdate();
  const lock = readLockInfo();
  const file = updateStateFile(SKILL_DIR);
  const state = {
    ...(readUpdateState(SKILL_DIR) || {}),
    date: todayKey(),
    scope: installScope(),
    lockFile: lock.file,
    lockFound: Boolean(lock.entry),
    command: command.join(' '),
    method,
    sourceType,
    updatedAt: new Date().toISOString(),
    ...patch,
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function hashSkillDir() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = full.slice(SKILL_DIR.length + 1).replace(/\\/g, '/');
      if (HASH_EXCLUDES.has(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ full, rel });
    }
  };
  walk(SKILL_DIR);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.rel);
    hash.update('\0');
    hash.update(readFileSync(file.full));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function runSkillCommand(command, method) {
  const isWin = process.platform === 'win32';
  const result = spawnSync(isWin ? 'cmd.exe' : 'npx', isWin ? ['/d', '/s', '/c', command.join(' ')] : command.slice(1), {
    cwd: installScope() === 'global' ? homedir() : projectRoot(),
    encoding: 'utf8',
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const failedByOutput = /failed to (update|add|install)|No installed skills found matching/i.test(output);
  const error = result.error ? String(result.error.message || result.error)
    : failedByOutput ? `npx skills ${method} reported failure` : null;
  return { command, method, result, output, ok: result.status === 0 && !failedByOutput, error };
}

function runUpdate() {
  const entry = readLockEntry();
  const { command, method, sourceType } = commandForUpdate();
  const state = readUpdateState(SKILL_DIR);
  const beforeRemoteHead = remoteHead(entry);
  const remoteChanged = Boolean(beforeRemoteHead && beforeRemoteHead !== state?.lastAppliedRemoteHead);
  const beforeHash = hashSkillDir();
  let attempt = runSkillCommand(command, method);
  let usedFallback = false;
  let fallbackReason = null;

  // update 失败，或远端变了但本地文件没变，改用 add 重装。
  const needFallback = method !== 'add' && (!attempt.ok || (remoteChanged && beforeHash === hashSkillDir()));
  if (needFallback) {
    const fallbacks = fallbackAddCommands(entry);
    if (fallbacks.length > 0) {
      fallbackReason = !entry ? 'lock entry missing or update did not find installed skill'
        : attempt.ok ? 'remote changed but update did not change local files' : 'update failed';
      const outputs = [attempt.output].filter(Boolean);
      usedFallback = true;
      for (const fallbackCommand of fallbacks) {
        const fallback = runSkillCommand(fallbackCommand, 'add');
        outputs.push(fallback.output);
        attempt = {
          ...fallback,
          output: outputs.filter(Boolean).join('\n\n--- fallback: npx skills add ---\n\n'),
          error: fallback.ok ? null : fallback.error || attempt.error,
        };
        if (fallback.ok) break;
      }
    }
  }

  const afterHash = hashSkillDir();
  writeState({
    status: attempt.ok ? 'success' : 'failed',
    finishedAt: new Date().toISOString(),
    exitCode: attempt.result.status,
    method: attempt.method,
    usedFallback,
    fallbackReason,
    sourceType,
    command: attempt.command.join(' '),
    error: attempt.error,
    remoteHead: beforeRemoteHead,
    remoteChanged,
    lastAppliedRemoteHead: attempt.ok
      ? beforeRemoteHead || state?.lastAppliedRemoteHead || null
      : state?.lastAppliedRemoteHead || null,
    changed: beforeHash !== afterHash,
    beforeHash,
    afterHash,
    output: attempt.output.slice(-2000),
  });
}

async function main() {
  if (alreadyUpdatedToday()) return;
  const fd = acquireLock();
  if (fd === null) return;
  try {
    if (alreadyUpdatedToday()) return;
    if (!(await waitForQuietWindow())) {
      writeState({
        status: 'deferred',
        finishedAt: new Date().toISOString(),
        exitCode: null,
        error: 'skill kept being used; update deferred after max wait',
        changed: false,
      });
      return;
    }
    writeState({ status: 'updating', startedAt: new Date().toISOString(), exitCode: null, changed: false });
    runUpdate();
  } finally {
    releaseLock(fd);
  }
}

// 只删缓存目录里的副本，不动 skill 目录里的原件。
function removeRunnerCopy() {
  if (normalizePath(dirname(SCRIPT_PATH)) !== normalizePath(RUNNER_DIR)) return;
  try {
    unlinkSync(SCRIPT_PATH);
  } catch {
    // 已删除或不可删，下次触发会覆盖同名文件。
  }
}

if (IS_MAIN) {
  main()
    .catch((err) => {
      try {
        writeState({
          status: 'failed',
          finishedAt: new Date().toISOString(),
          exitCode: null,
          error: String(err?.message || err),
          changed: false,
        });
      } catch {
        // 状态都写不了就放弃，下次调用会再试。
      }
    })
    .finally(removeRunnerCopy);
}
