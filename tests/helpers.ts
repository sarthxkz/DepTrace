import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLI_PATH = path.join(ROOT, 'dist', 'index.js');

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], cwd: string): CliResult {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const created: string[] = [];

/** Creates a temp directory that is removed after each test. */
export async function makeTempDir(prefix = 'deptrace-test-'): Promise<string> {
  // realpath: on macOS tmpdir() is a symlink, while process.cwd() in the child is resolved.
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
