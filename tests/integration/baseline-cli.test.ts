import { spawnSync } from 'node:child_process';
import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, defined, FIXTURES, makeTempDir, runCli, writeTree } from '../helpers.js';
import { sarifValidator } from '../schemas.js';

interface CheckJson {
  result: string;
  summary: { errors: number; warnings: number; failing: number };
  violations: { ruleId: string; file: string; fingerprint: string; baselineStatus?: string }[];
  baseline?: {
    file: string;
    new: number;
    existing: number;
    resolved: number;
    resolvedViolations: { file: string }[];
  };
}

const BASELINE = 'deptrace-baseline.json';
const NEW_VIOLATION = {
  'src/domain/audit.ts': "import '../infrastructure/db/connection';\nexport {};\n",
};

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

/** The layered sample as a Git repository whose first commit contains an approved baseline. */
async function repositoryWithBaseline() {
  const root = await copyFixture('layered');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'core.autocrlf', 'false');
  expect(runCli(['baseline', 'create'], root).code).toBe(0);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'Adopt DepTrace with a baseline');
  return root;
}

const check = (root: string, ...args: string[]) => {
  const result = runCli(['check', '--baseline', BASELINE, '--format', 'json', ...args], root);
  return { ...result, json: JSON.parse(result.stdout || '{}') as CheckJson };
};

describe('baseline create and update', () => {
  it('creates a baseline, refuses to overwrite it, and updates only explicitly', async () => {
    const root = await copyFixture('layered');
    const created = runCli(['baseline', 'create'], root);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain(
      'Created deptrace-baseline.json with 7 accepted violations (5 errors, 2 warnings).',
    );
    const original = await readFile(path.join(root, BASELINE), 'utf8');

    const again = runCli(['baseline', 'create'], root);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('already exists');
    expect(await readFile(path.join(root, BASELINE), 'utf8')).toBe(original);

    await writeTree(root, NEW_VIOLATION);
    const updated = runCli(['baseline', 'update'], root);
    expect(updated.code).toBe(0);
    expect(updated.stdout).toContain(
      '8 accepted violations (6 errors, 2 warnings); 1 added, 0 removed, 7 unchanged.',
    );
    expect(updated.stdout).toContain('every added entry accepts a violation');
  });

  it('is byte-for-byte reproducible in another checkout location', async () => {
    const first = await copyFixture('layered');
    const second = await copyFixture('layered');
    runCli(['baseline', 'create'], first);
    runCli(['baseline', 'create', second], path.dirname(second));
    expect(await readFile(path.join(second, BASELINE), 'utf8')).toBe(
      await readFile(path.join(first, BASELINE), 'utf8'),
    );
  });

  it('writes to --file, and update needs an existing baseline', async () => {
    const root = await copyFixture('layered');
    expect(runCli(['baseline', 'update', '--file', 'ci/b.json'], root)).toMatchObject({ code: 2 });
    await writeTree(root, { 'ci/.keep': '' });
    expect(runCli(['baseline', 'create', '--file', 'ci/b.json'], root).code).toBe(0);
    expect(runCli(['check', '--baseline', 'ci/b.json'], root).code).toBe(0);
  });

  it('replaces an invalid baseline on update and says why the old one was unusable', async () => {
    const root = await copyFixture('layered');
    await writeFile(path.join(root, BASELINE), 'not json');
    const result = runCli(['baseline', 'update'], root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('The previous baseline could not be used');
    expect(check(root).code).toBe(0);
  });

  it('requires a configuration with rules', async () => {
    const dir = await makeTempDir();
    expect(runCli(['baseline', 'create'], dir)).toMatchObject({ code: 2 });
    expect(runCli(['baseline'], dir).code).toBe(2);
  });
});

describe('check --baseline in a Git repository', () => {
  it('passes when the code matches the approved baseline', async () => {
    const root = await repositoryWithBaseline();
    const { code, json } = check(root);
    expect(code).toBe(0);
    expect(json.result).toBe('passed');
    expect(json.baseline).toMatchObject({ file: BASELINE, new: 0, existing: 7, resolved: 0 });
    // Existing violations are still reported, marked as such.
    expect(json.violations).toHaveLength(7);
    expect(new Set(json.violations.map((v) => v.baselineStatus))).toEqual(new Set(['existing']));
    expect(json.summary).toMatchObject({ errors: 5, warnings: 2, failing: 0 });
  });

  it('fails with exit 3 on a new violation, and reports only it as new', async () => {
    const root = await repositoryWithBaseline();
    await writeTree(root, NEW_VIOLATION);
    const { code, json, stderr } = check(root);
    expect(code).toBe(3);
    expect(json.result).toBe('failed');
    expect(json.violations.filter((v) => v.baselineStatus === 'new').map((v) => v.file)).toEqual([
      'src/domain/audit.ts',
    ]);
    expect(stderr).toContain(
      '1 new failing violation (7 existing violations accepted by the baseline)',
    );
    // The full check (without baseline) still fails on everything.
    expect(runCli(['check'], root).code).toBe(3);
  });

  it('reports resolved entries without failing', async () => {
    const root = await repositoryWithBaseline();
    // Fix the legacy import (forbidden-imports/no-legacy).
    const file = path.join(root, 'src/presentation/cli.ts');
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace(/^import .*legacy\/format.*$/m, ''));
    const { code, json } = check(root);
    expect(code).toBe(0);
    expect(json.baseline?.resolvedViolations.map((entry) => entry.file)).toEqual([
      'src/presentation/cli.ts',
    ]);
    const text2 = runCli(['check', '--baseline', BASELINE], root).stdout;
    expect(text2).toContain('resolved  src/presentation/cli.ts  [forbidden-imports/no-legacy]');
  });

  it('treats a new warning as non-blocking unless --strict', async () => {
    const root = await repositoryWithBaseline();
    await writeTree(root, { 'src/application/old.ts': "import '../legacy/format';\nexport {};\n" });
    expect(check(root).code).toBe(0);
    const strict = check(root, '--strict');
    expect(strict.code).toBe(3);
    expect(strict.stderr).toContain('strict mode');
  });

  it('classifies a changed dependency: the old one resolved, the new one new', async () => {
    const root = await repositoryWithBaseline();
    // pricing.ts imports infrastructure/db/connection; point it at another infrastructure file instead.
    const file = path.join(root, 'src/domain/pricing.ts');
    const text = await readFile(file, 'utf8');
    expect(text).toContain('../infrastructure/db/connection');
    await writeFile(
      file,
      text.replace('../infrastructure/db/connection', '../infrastructure/db/order-repository'),
    );
    const { code, json } = check(root);
    expect(code).toBe(3);
    expect(json.baseline).toMatchObject({ new: 1, resolved: 1 });
  });

  it('works in a shallow clone: no Git history is needed', async () => {
    const origin = await repositoryWithBaseline();
    const clone = path.join(await makeTempDir(), 'clone');
    git(
      path.dirname(clone),
      'clone',
      '--quiet',
      '--depth',
      '1',
      `file://${origin.split(path.sep).join('/')}`,
      clone,
    );
    expect(check(clone).code).toBe(0);
    await writeTree(clone, NEW_VIOLATION);
    expect(check(clone).code).toBe(3);
  });
});

describe('check --baseline errors (exit 2)', () => {
  it('fails on a missing baseline instead of treating it as empty', async () => {
    const root = await copyFixture('layered');
    const result = check(root);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Baseline file not found');
  });

  it('fails on invalid JSON, a newer schema or tampered entries', async () => {
    const root = await repositoryWithBaseline();
    const file = path.join(root, BASELINE);
    const valid = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

    await writeFile(file, '{');
    expect(check(root)).toMatchObject({
      code: 2,
      stderr: expect.stringContaining('not valid JSON') as string,
    });

    await writeFile(file, JSON.stringify({ ...valid, schemaVersion: 99 }));
    expect(check(root).stderr).toContain('unsupported schemaVersion 99');

    const entries = valid.violations as Record<string, unknown>[];
    await writeFile(file, JSON.stringify({ ...valid, violations: [...entries, entries[0]] }));
    expect(check(root).stderr).toContain('duplicate fingerprint');

    await writeFile(
      file,
      JSON.stringify({ ...valid, violations: [{ ...entries[0], file: '../../etc/passwd' }] }),
    );
    expect(check(root).stderr).toContain('violations[0].file: must be a repository-relative path');
  });

  it('fails when the configuration changed since the baseline was approved', async () => {
    const root = await repositoryWithBaseline();
    const configFile = path.join(root, 'deptrace.yml');
    const yaml = await readFile(configFile, 'utf8');
    await writeFile(
      configFile,
      yaml.replace('packages: ["express", "pg"]', 'packages: ["express"]'),
    );
    const changed = check(root);
    expect(changed.code).toBe(2);
    expect(changed.stderr).toContain('rule "forbidden-packages/pure-domain" changed');
    expect(changed.stderr).toContain('baseline update');

    // Severity changes do not invalidate it; the accepted warnings, now errors, stay accepted.
    await writeFile(configFile, yaml.replace(/severity: warning/g, 'severity: error'));
    expect(check(root)).toMatchObject({ code: 0, json: { summary: { errors: 7, failing: 0 } } });
  });

  it('keeps reporting configuration errors as exit 2', async () => {
    const root = await repositoryWithBaseline();
    await writeFile(path.join(root, 'deptrace.yml'), 'version: 1\nrules: {}\n');
    expect(check(root).code).toBe(2);
  });
});

describe('CI outputs', () => {
  const validateSarif = sarifValidator();

  it('writes the JSON report, a SARIF log and an appended Markdown summary', async () => {
    const root = await repositoryWithBaseline();
    await writeTree(root, NEW_VIOLATION);
    const summary = path.join(root, 'out', 'summary.md');
    await writeTree(root, { 'out/summary.md': '# Earlier step\n' });
    const result = runCli(
      [
        'check',
        '--baseline',
        BASELINE,
        '--report',
        'out/report.json',
        '--sarif',
        'out/deptrace.sarif',
        '--summary',
        summary,
      ],
      root,
    );
    expect(result.code).toBe(3);
    const report = JSON.parse(
      await readFile(path.join(root, 'out/report.json'), 'utf8'),
    ) as CheckJson;
    expect(report.baseline).toMatchObject({ new: 1, existing: 7 });

    const sarif = JSON.parse(await readFile(path.join(root, 'out/deptrace.sarif'), 'utf8')) as {
      runs: {
        results: {
          baselineState: string;
          locations: { physicalLocation: { artifactLocation: { uri: string } } }[];
        }[];
      }[];
    };
    expect(validateSarif(sarif)).toBe(true);
    expect(defined(sarif.runs[0]).results.filter((r) => r.baselineState === 'new')).toHaveLength(1);

    const markdown = await readFile(summary, 'utf8');
    expect(markdown.startsWith('# Earlier step\n## DepTrace architecture check: failed')).toBe(
      true,
    );
    expect(markdown).toContain('| New | 1 | 0 | 1 |');
  });

  it('uses paths relative to the Git root for a project in a subdirectory', async () => {
    const repo = await makeTempDir();
    git(repo, 'init', '--quiet');
    const project = path.join(repo, 'packages', 'shop');
    await cp(path.join(FIXTURES, 'layered'), project, { recursive: true });
    const result = runCli(
      ['check', 'packages/shop', '--format', 'github', '--sarif', 'out.sarif'],
      repo,
    );
    expect(result.code).toBe(3);
    expect(result.stdout).toMatch(
      /^::error file=packages\/shop\/src\/domain\/pricing\.ts,line=\d+,col=\d+,/m,
    );
    const sarif = await readFile(path.join(repo, 'out.sarif'), 'utf8');
    expect(sarif).toContain('"uri": "packages/shop/src/domain/pricing.ts"');
    // The JSON report keeps paths relative to the analyzed directory.
    expect(runCli(['check', 'packages/shop', '--format', 'json'], repo).stdout).toContain(
      '"file": "src/domain/pricing.ts"',
    );
  });

  it('--format github disables workflow commands around repository-controlled text', async () => {
    const root = await repositoryWithBaseline();
    // A file name and an import specifier that look like workflow commands.
    await writeTree(root, {
      // TypeScript reads the escape, so the specifier contains a real newline.
      'src/domain/injected.ts':
        "import '../infrastructure/db/connection\\n::error::injected';\nimport '../infrastructure/db/connection';\n",
      // ':' is not allowed in Windows file names.
      ...(process.platform !== 'win32' && {
        'src/domain/::warning::x.ts': "import '../infrastructure/db/connection';\n",
      }),
    });
    const result = runCli(['check', '--baseline', BASELINE, '--format', 'github'], root);
    expect(result.code).toBe(3);
    const lines = result.stdout.split('\n');
    const start = lines.findIndex((l) => /^::stop-commands::[0-9a-f]{32}$/.test(l));
    const token = defined(lines[start]).slice('::stop-commands::'.length);
    const end = lines.indexOf(`::${token}::`);
    expect(start).toBe(0);
    expect(end).toBeGreaterThan(start);
    // Every line that GitHub would treat as a command is either ours or inside the stopped region.
    for (const [index, line] of lines.entries()) {
      if (index > start && index < end) continue;
      if (line.trimStart().startsWith('::')) {
        expect(line).toMatch(
          /^::(stop-commands::|[0-9a-f]{32}::$|error file=|warning file=|notice title=)/,
        );
      }
    }
    const annotations = lines.slice(end + 1).filter((l) => l.startsWith('::'));
    expect(annotations.some((l) => l.startsWith('::error file=src/domain/injected.ts,'))).toBe(
      true,
    );
    expect(annotations.every((l) => !l.includes('\n'))).toBe(true);
  });

  it('reports output file errors as operational errors (exit 1)', async () => {
    const root = await copyFixture('layered');
    await writeTree(root, { blocker: 'a file, not a directory' });
    expect(runCli(['check', '--report', 'blocker/report.json'], root).code).toBe(1);
  });
});
