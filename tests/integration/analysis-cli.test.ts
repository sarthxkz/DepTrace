import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, copyFixture, runCli } from '../helpers.js';

interface ScanJson {
  schemaVersion: number;
  tool: { name: string; version: string };
  status: string;
  repository: { packageName: string | null; packageVersion: string | null; git: boolean };
  summary: Record<string, number>;
  nodes: { id: string }[];
  edges: { from: string; to: string }[];
  cycles: { nodes: string[]; representativePath: string[]; runtime: boolean }[];
  externalDependencies: unknown[];
  unresolvedDependencies: unknown[];
  diagnostics: unknown[];
}

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
};

describe('scan', async () => {
  const app = await copyFixture('app');

  it('prints a labelled report and exits 0 even when cycles exist', () => {
    const result = runCli(['scan'], app);
    expect(result.code).toBe(0);
    for (const label of [
      'Source files discovered:        14',
      'Parsed without syntax errors:   13',
      'Internal (resolved to a file):  16',
      'External:                       3 references to 3 packages',
      'Unresolved:                     3',
      'Nodes (files):                  14',
      'Edges (file -> file):           15 (4 type-only)',
      'Strongly connected components:  12 (3 cyclic)',
      'Circular dependencies: 3 cyclic components (2 runtime, 1 type-only)',
      'src/services/api.ts -> src/utils/index.ts -> src/services/api.ts',
      '[parse-error]',
      'Analysis completed with diagnostics',
    ]) {
      expect(result.stdout).toContain(label);
    }
    expect(result.stderr).toBe('');
  });

  it('lists edge locations with --verbose', () => {
    const result = runCli(['scan', '--verbose'], app);
    expect(result.stdout).toContain(
      'src/services/api.ts -> src/utils/index.ts  "../utils" import 1:24',
    );
    expect(result.stdout).toContain('left-pad: 1 reference');
  });

  it('emits valid, documented JSON without absolute paths', () => {
    const result = runCli(['scan', app, '--format', 'json'], path.dirname(app));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const json = JSON.parse(result.stdout) as ScanJson;
    expect(json.schemaVersion).toBe(1);
    expect(json.tool).toEqual({ name: 'deptrace', version: pkg.version });
    expect(json.status).toBe('completed-with-diagnostics');
    expect(json.repository).toEqual({
      packageName: 'fixture-app',
      packageVersion: '1.0.0',
      git: false,
    });
    expect(json.summary.nodes).toBe(json.nodes.length);
    expect(json.summary.edges).toBe(json.edges.length);
    expect(json.cycles).toHaveLength(3);
    expect(result.stdout).not.toContain(app);
    expect(result.stdout).not.toContain(app.split(path.sep).join('/'));
    expect(result.stdout).not.toContain('\u001b');
    expect(result.stdout).not.toMatch(/"[^"]+":\s*undefined/);
  });

  it('produces identical JSON on repeated runs (except duration)', () => {
    const normalize = (stdout: string) => stdout.replace(/"durationMs": \d+/, '"durationMs": 0');
    const first = runCli(['scan', '--format', 'json'], app).stdout;
    const second = runCli(['scan', '--format', 'json'], app).stdout;
    expect(normalize(second)).toBe(normalize(first));
  });

  it('applies include/exclude from deptrace.yml', async () => {
    const root = await copyFixture('app');
    await writeFile(
      path.join(root, 'deptrace.yml'),
      'version: 1\nproject:\n  name: app\nanalysis:\n  include:\n    - "src/**/*"\n  exclude:\n    - "src/types-cycle/**"\nrules: []\n',
    );
    const json = JSON.parse(runCli(['scan', '--format', 'json'], root).stdout) as ScanJson;
    expect(json.nodes.some((node) => node.id.startsWith('src/types-cycle/'))).toBe(false);
    expect(json.cycles).toHaveLength(2);
  });

  it('rejects an invalid deptrace.yml with exit code 2', async () => {
    const root = await copyFixture('app');
    await writeFile(
      path.join(root, 'deptrace.yml'),
      'version: 1\nproject:\n  name: app\nanalysis:\n  include: ["../**"]\n  exclude: []\nrules: []\n',
    );
    const result = runCli(['scan'], root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('must be relative to the repository root');
  });

  it('rejects malformed YAML with exit code 2', async () => {
    const root = await copyFixture('app');
    await writeFile(path.join(root, 'deptrace.yml'), 'version: [1\n');
    const result = runCli(['scan'], root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Invalid deptrace.yml');
  });

  it('rejects an unknown --format with exit code 2', () => {
    expect(runCli(['scan', '--format', 'xml'], app).code).toBe(2);
  });

  it('works on a config created by init', async () => {
    const root = await copyFixture('monorepo');
    expect(runCli(['init'], root).code).toBe(0);
    const result = runCli(['scan'], root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Configuration:                  deptrace.yml');
  });
});

describe('deps', async () => {
  const app = await copyFixture('app');

  it('shows outgoing dependencies by default', () => {
    const result = runCli(['deps', 'src/index.ts'], app);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Outgoing (what src/index.ts imports):');
    expect(result.stdout).toContain('Internal files (6):');
    expect(result.stdout).toContain(
      'src/math.ts  "./math.js" import 5:23, "./math.js" re-export 16:15',
    );
    expect(result.stdout).toContain('left-pad  "left-pad" import 6:21');
    expect(result.stdout).toContain('Unresolved (3):');
    expect(result.stdout).not.toContain('Incoming');
  });

  it('shows incoming dependencies', () => {
    const result = runCli(['deps', 'src/utils/index.ts', '--direction', 'incoming'], app);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Internal files (3):');
    for (const importer of ['src/component.tsx', 'src/index.ts', 'src/services/api.ts']) {
      expect(result.stdout).toContain(`    ${importer}  `);
    }
    expect(result.stdout).toContain('is in a cyclic component of 2 file(s)');
  });

  it('emits JSON for both directions', () => {
    const result = runCli(['deps', 'src/math.ts', '-d', 'both', '--format', 'json'], app);
    const json = JSON.parse(result.stdout) as {
      file: string;
      outgoing: { internal: unknown[] };
      incoming: { from: string }[];
      cycle: unknown;
    };
    expect(json.file).toBe('src/math.ts');
    expect(json.outgoing.internal).toEqual([]);
    expect(json.incoming.map((edge) => edge.from)).toEqual([
      'src/broken.ts',
      'src/index.ts',
      'src/legacy.cjs',
    ]);
    expect(json.cycle).toBeNull();
  });

  it('accepts absolute paths and --root', () => {
    const file = path.join(app, 'src', 'math.ts');
    const result = runCli(['deps', file, '--root', app], path.dirname(app));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Dependencies of src/math.ts');
  });

  it.runIf(process.platform === 'win32')('accepts backslash paths on Windows', () => {
    const result = runCli(['deps', 'src\\utils\\index.ts'], app);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Dependencies of src/utils/index.ts');
  });

  it.each([
    ['a missing file', ['deps', 'src/nope.ts'], 'File not found'],
    ['a non-source file', ['deps', 'src/data.json'], 'is not an analyzed source file'],
    ['an excluded file', ['deps', 'dist/bundle.js'], 'is not an analyzed source file'],
    [
      'a file outside the root',
      ['deps', '../app/src/math.ts', '--root', 'src/services'],
      'outside the analyzed root',
    ],
    ['an invalid direction', ['deps', 'src/math.ts', '-d', 'sideways'], 'Allowed choices'],
  ])('rejects %s with exit code 2', (_label, args, message) => {
    const result = runCli(args, app);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(message);
  });
});

describe('path', async () => {
  const app = await copyFixture('app');

  it('prints a shortest dependency path with import locations', () => {
    const result = runCli(['path', 'src/component.tsx', 'src/services/api.ts'], app);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      'Dependency path from src/component.tsx to src/services/api.ts (2 steps):',
    );
    expect(result.stdout).toContain('-> src/utils/index.ts  "./utils" import 1:24');
    expect(result.stdout).toContain('-> src/services/api.ts  "../services/api" import 1:21');
  });

  it('reports when no path exists and still exits 0', () => {
    const result = runCli(['path', 'src/math.ts', 'src/index.ts'], app);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No dependency path from src/math.ts to src/index.ts.');
  });

  it('emits JSON', () => {
    const result = runCli(['path', 'src/index.ts', 'src/math.ts', '--format', 'json'], app);
    const json = JSON.parse(result.stdout) as { path: string[]; steps: unknown[] };
    expect(json.path).toEqual(['src/index.ts', 'src/math.ts']);
    expect(json.steps).toHaveLength(1);
  });

  it('emits null for a missing path in JSON', () => {
    const result = runCli(['path', 'src/math.ts', 'src/index.ts', '--format', 'json'], app);
    expect((JSON.parse(result.stdout) as { path: unknown }).path).toBeNull();
  });

  it('requires both arguments', () => {
    expect(runCli(['path', 'src/index.ts'], app).code).toBe(2);
  });
});

describe('JSON example', () => {
  it('docs/examples/scan-output.json matches the current output for tests/fixtures/app', async () => {
    // Regenerate: node dist/index.js scan tests/fixtures/app --format json > docs/examples/scan-output.json
    const example = await readFile(path.join(ROOT, 'docs', 'examples', 'scan-output.json'), 'utf8');
    const actual = runCli(['scan', 'tests/fixtures/app', '--format', 'json'], ROOT).stdout;
    const normalize = (text: string) =>
      text
        .replace(/\r\n/g, '\n')
        .replace(/"durationMs": \d+/, '"durationMs": 0')
        .replace(/("tool": \{\s*"name": "deptrace",\s*"version": )"[^"]+"/, '$1"x"');
    expect(normalize(actual)).toBe(normalize(example));
  });
});
