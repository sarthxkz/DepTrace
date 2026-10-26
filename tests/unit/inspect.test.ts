import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/core/constants.js';
import { inspectRepository } from '../../src/core/inspect.js';
import { makeTempDir } from '../helpers.js';

describe('inspectRepository', () => {
  it('inspects an empty directory', async () => {
    const dir = await makeTempDir();
    const info = await inspectRepository(dir);
    expect(info).toMatchObject({ path: dir, packageJson: undefined, hasTsconfig: false });
  });

  it('reads package.json and detects tsconfig.json', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"demo","version":"1.2.3"}');
    await writeFile(path.join(dir, 'tsconfig.json'), '{}');
    const info = await inspectRepository(dir);
    expect(info.packageJson).toEqual({ name: 'demo', version: '1.2.3' });
    expect(info.hasTsconfig).toBe(true);
  });

  it('reports an unparseable package.json without failing', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'package.json'), '{ not json');
    expect((await inspectRepository(dir)).packageJson).toBe('invalid');
  });

  it('ignores a package.json that is a directory', async () => {
    const dir = await makeTempDir();
    await mkdir(path.join(dir, 'package.json'));
    expect((await inspectRepository(dir)).packageJson).toBeUndefined();
  });

  it('handles paths containing spaces', async () => {
    const dir = path.join(await makeTempDir(), 'with some spaces');
    await mkdir(dir);
    expect((await inspectRepository(dir)).path).toBe(dir);
  });

  it('rejects a missing path as a usage error', async () => {
    const dir = path.join(await makeTempDir(), 'missing');
    await expect(inspectRepository(dir)).rejects.toMatchObject({
      exitCode: ExitCode.UsageError,
      message: `Directory not found: ${dir}`,
    });
  });

  it('rejects a file as a usage error', async () => {
    const file = path.join(await makeTempDir(), 'file.txt');
    await writeFile(file, '');
    await expect(inspectRepository(file)).rejects.toMatchObject({
      exitCode: ExitCode.UsageError,
      message: `Not a directory: ${file}`,
    });
  });

  it('detects a .git directory in the target and in ancestors', async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, '.git'));
    const nested = path.join(root, 'packages', 'app');
    await mkdir(nested, { recursive: true });
    expect((await inspectRepository(root)).gitRoot).toBe(root);
    expect((await inspectRepository(nested)).gitRoot).toBe(root);
  });

  it('detects a .git file (worktrees and submodules)', async () => {
    const root = await makeTempDir();
    await writeFile(path.join(root, '.git'), 'gitdir: /elsewhere\n');
    expect((await inspectRepository(root)).gitRoot).toBe(root);
  });
});
