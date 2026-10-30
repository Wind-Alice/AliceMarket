#!/usr/bin/env node
// Load runtime modules under the package replacement lock.
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_DIR = dirname(dirname(SCRIPT_PATH));
let client;

export async function main(argv) {
  const { withPackageLock } = await import('./package-lock.mjs');
  client = await withPackageLock(SKILL_DIR, () => import('./client.mjs'));
  return client.main(argv);
}

function fail(error) {
  if (client) return client.fail(error);
  process.stdout.write(JSON.stringify({ ok: false, code: error.code || 'SKILL_LOAD_ERROR', message: error.message }, null, 2) + '\n');
  process.exitCode = 1;
}

const IS_MAIN = process.argv[1] && realpathSync(SCRIPT_PATH) === realpathSync(process.argv[1]);
if (IS_MAIN) main(process.argv.slice(2)).catch(fail);
