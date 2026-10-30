// Serialize module loading and package replacement, not remote data requests.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function packageLockPath(skillDir) {
  let root = resolve(skillDir);
  if (existsSync(root)) root = realpathSync(root);
  root = root.replace(/\\/g, '/');
  if (process.platform === 'win32') root = root.toLowerCase();
  const id = createHash('sha256').update(root).digest('hex').slice(0, 24);
  return join(homedir(), '.cache', 'wind-aifinmarket', 'locks', `${id}.package.lock`);
}

function discardDeadLock(file) {
  try {
    const owner = JSON.parse(readFileSync(file, 'utf8'));
    if (Number.isSafeInteger(owner?.pid) && owner.pid > 0) {
      try { process.kill(owner.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') unlinkSync(file); }
      return;
    }
  } catch {}
  try { if (Date.now() - statSync(file).mtimeMs > 30_000) unlinkSync(file); } catch {}
}

export async function withPackageLock(skillDir, operation, { timeoutMs = 60_000 } = {}) {
  const file = packageLockPath(skillDir);
  mkdirSync(join(file, '..'), { recursive: true });
  const token = randomUUID();
  const started = Date.now();
  let fd;
  while (fd === undefined) {
    try { fd = openSync(file, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      discardDeadLock(file);
      if (Date.now() - started >= timeoutMs) {
        const busy = new Error('Skill 文件正在加载或更新，请稍后重试。');
        busy.code = 'SKILL_PACKAGE_BUSY';
        throw busy;
      }
      await new Promise(done => setTimeout(done, 25));
    }
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
    return await operation();
  } finally {
    try { closeSync(fd); } catch {}
    try { if (JSON.parse(readFileSync(file, 'utf8')).token === token) unlinkSync(file); } catch {}
  }
}
