import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_PATH, ROOT, makeTempDir, runCli } from '../helpers.js';

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
  bin: Record<string, string>;
};

describe('help and version', () => {
  it('prints help with commands and examples', async () => {
    const result = runCli(['--help'], await makeTempDir());
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DepTrace');
    for (const command of ['init', 'scan', 'check', 'report']) {
      expect(result.stdout).toContain(command);
    }
    expect(result.stdout).toContain('Examples:');
  });

  it('prints command help', async () => {
    const result = runCli(['init', '--help'], await makeTempDir());
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('never overwritten');
  });

  it('prints the package.json version', async () => {
    const result = runCli(['--version'], await makeTempDir());
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });
});

describe('invalid usage exits with code 2', () => {
  it.each([
    ['no command', []],
    ['an unknown command', ['bogus']],
    ['an unknown option', ['scan', '--bogus']],
    ['too many arguments', ['scan', 'a', 'b']],
    ['arguments to check', ['check', 'extra']],
  ])('%s', async (_label, args) => {
    const result = runCli(args, await makeTempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).not.toBe('');
  });
});

describe('init', () => {
  it('creates deptrace.yml, then refuses to overwrite it', async () => {
    const dir = await makeTempDir();
    const first = runCli(['init'], dir);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('Created');
    const content = await readFile(path.join(dir, 'deptrace.yml'), 'utf8');

    const second = runCli(['init'], dir);
    expect(second.code).toBe(1);
    expect(second.stderr).toContain('already exists');
    expect(await readFile(path.join(dir, 'deptrace.yml'), 'utf8')).toBe(content);
  });
});

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const directoryRow = (dir: string) => new RegExp(`Directory:\\s+${escape(dir)}\\n`);

describe('scan', () => {
  it('inspects the current directory by default', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"demo","version":"1.0.0"}');
    const result = runCli(['scan'], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(directoryRow(dir));
    expect(result.stdout).toContain('demo@1.0.0');
    expect(result.stdout).toContain('Analysis completed in');
  });

  it('accepts relative and absolute paths, including spaces', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'my project');
    await mkdir(target);
    for (const arg of ['my project', target, '.']) {
      const cwd = arg === '.' ? target : dir;
      const result = runCli(['scan', arg], cwd);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(directoryRow(target));
    }
  });

  it('reports a missing directory with exit code 2', async () => {
    const result = runCli(['scan', 'missing'], await makeTempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('error: Directory not found');
    expect(result.stderr).not.toContain('    at ');
  });

  it('reports a file with exit code 2', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'file.txt'), '');
    const result = runCli(['scan', 'file.txt'], dir);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('error: Not a directory');
  });

  it('shows a stack trace only with --debug', async () => {
    const result = runCli(['scan', 'missing', '--debug'], await makeTempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('[debug]');
    expect(result.stderr).toContain('    at ');
  });
});

describe('placeholder commands exit with code 4', () => {
  it.each([
    ['check', 'Architecture checking is not implemented'],
    ['report', 'Report generation is not implemented'],
  ])('%s', async (command, message) => {
    const result = runCli([command], await makeTempDir());
    expect(result.code).toBe(4);
    expect(result.stderr).toContain(message);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/pass/i);
  });
});

describe('packaging', () => {
  it('maps the deptrace bin to the built entry point with a shebang', async () => {
    expect(path.resolve(ROOT, pkg.bin.deptrace ?? '')).toBe(CLI_PATH);
    expect((await readFile(CLI_PATH, 'utf8')).startsWith('#!/usr/bin/env node\n')).toBe(true);
  });
});
