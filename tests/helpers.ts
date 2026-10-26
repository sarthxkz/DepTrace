import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';

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

/** Creates a temp directory that is removed when the test file finishes. */
export async function makeTempDir(prefix = 'deptrace-test-'): Promise<string> {
  // realpath: on macOS tmpdir() is a symlink, while process.cwd() in the child is resolved.
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

export const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

/** Copies tests/fixtures/<name> into a fresh temp directory and returns the copy's path. */
export async function copyFixture(name: string): Promise<string> {
  const target = path.join(await makeTempDir(), name);
  await cp(path.join(FIXTURES, name), target, { recursive: true });
  return target;
}

/** Writes `files` (relative path → content) under `root`. */
export async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

afterAll(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
