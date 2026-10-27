import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { redactPaths } from '../../src/analysis/paths.js';
import { terminalSafe } from '../../src/core/errors.js';
import { makeTempDir, runCli, writeTree } from '../helpers.js';

const ESC = String.fromCharCode(0x1b);
const RLO = String.fromCharCode(0x202e); // RIGHT-TO-LEFT OVERRIDE
const LRI = String.fromCharCode(0x2066); // LEFT-TO-RIGHT ISOLATE

describe('redactPaths', () => {
  const root = path.join(path.parse(process.cwd()).root, 'work', 'repo');
  const home = path.join(path.parse(process.cwd()).root, 'home', 'alice');
  const posix = (p: string) => p.split(path.sep).join('/');

  it('makes paths under the root repository-relative, in either separator style', () => {
    expect(redactPaths(`Cannot read file '${posix(root)}/configs/base.json'.`, root, home)).toBe(
      "Cannot read file 'configs/base.json'.",
    );
    expect(redactPaths(`open '${root}${path.sep}src${path.sep}a.ts'`, root, home)).toBe(
      `open 'src${path.sep}a.ts'`,
    );
    expect(redactPaths(`in ${root}`, root, home)).toBe('in .');
  });

  it('replaces the home directory and leaves other paths alone', () => {
    expect(redactPaths(`see ${posix(home)}/.config/tsconfig.json`, root, home)).toBe(
      'see ~/.config/tsconfig.json',
    );
    // A longer name that merely starts like the root is not the root.
    expect(redactPaths(`${posix(root)}-old/x.ts`, root, home)).toBe(`${posix(root)}-old/x.ts`);
    expect(redactPaths('no paths here', root, home)).toBe('no paths here');
  });

  it('never treats a filesystem root as something to strip', () => {
    const fsRoot = path.parse(process.cwd()).root;
    expect(redactPaths(`${fsRoot}etc/hosts`, fsRoot, fsRoot)).toBe(`${fsRoot}etc/hosts`);
  });

  it.runIf(process.platform === 'win32')(
    'matches drive letters case-insensitively on Windows',
    () => {
      expect(redactPaths("open 'c:/WORK/repo/a.ts'", 'C:\\work\\repo', 'C:\\Users\\x')).toBe(
        "open 'a.ts'",
      );
    },
  );
});

describe('terminalSafe', () => {
  it('escapes escape sequences and bidirectional controls, keeping newlines and tabs', () => {
    expect(terminalSafe(`a${ESC}[31mb`)).toBe('a\\u001b[31mb');
    expect(terminalSafe(`x${RLO}gpj.ts ${LRI}`)).toBe('x\\u202egpj.ts \\u2066');
    expect(terminalSafe('line 1\n\tline 2 — ünïcödé')).toBe('line 1\n\tline 2 — ünïcödé');
  });
});

describe('reports and terminal output from a hostile repository', () => {
  it('keeps absolute paths out of JSON reports', async () => {
    const dir = await makeTempDir();
    await writeTree(dir, {
      'tsconfig.json': '{ "extends": "./missing-base.json" }\n',
      'src/a.ts': 'export const a = 1;\n',
    });
    const result = runCli(['scan', '--format', 'json'], dir);
    expect(result.code).toBe(0);
    const forward = dir.split(path.sep).join('/');
    expect(result.stdout).not.toContain(forward);
    expect(result.stdout.toLowerCase()).not.toContain(dir.toLowerCase().replaceAll('\\', '\\\\'));
    const report = JSON.parse(result.stdout) as {
      diagnostics: { code: string; message: string }[];
    };
    const tsconfig = report.diagnostics.find((d) => d.code === 'tsconfig-error');
    expect(tsconfig?.message).toContain("'missing-base.json'");
  });

  it('escapes control and bidi characters from import specifiers in text output', async () => {
    const dir = await makeTempDir();
    await writeTree(dir, { 'src/.keep': '' });
    await writeFile(
      path.join(dir, 'src', 'a.ts'),
      `import a from "${ESC}[31mred";\nimport b from "./x${RLO}gpj.ts";\nexport const c = 1;\n`,
    );
    const result = runCli(['scan', '.'], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain(ESC);
    expect(result.stdout).not.toContain(RLO);
    expect(result.stdout).toContain('Cannot resolve "\\u001b[31mred"');
    expect(result.stdout).toContain('./x\\u202egpj.ts');
  });
});
