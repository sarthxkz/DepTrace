import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, makeTempDir, runCli, writeTree } from '../helpers.js';

interface CheckJson {
  schemaVersion: number;
  result: 'passed' | 'failed';
  strict: boolean;
  summary: { rules: number; enabledRules: number; errors: number; warnings: number };
  analysis: { status: string };
  rules: { id: string; severity: string; violations: number }[];
  violations: {
    ruleId: string;
    severity: string;
    file: string;
    target: unknown;
    fingerprint: string;
    message: string;
    references: unknown[];
  }[];
}

const EXPECTED_LAYERED_VIOLATIONS = [
  'warning circular-dependencies src/application/notify.ts',
  'error forbidden-packages/pure-domain src/domain/pricing.ts',
  'error layer-boundaries src/domain/pricing.ts',
  'error module-boundaries/features src/features/catalog/ui/catalog-page.ts',
  'error layer-boundaries src/infrastructure/http/server.ts',
  'error layer-boundaries src/presentation/cli.ts',
  'warning forbidden-imports/no-legacy src/presentation/cli.ts',
];

const checkJson = (cwd: string, args: string[] = []) => {
  const result = runCli(['check', '--format', 'json', ...args], cwd);
  return { ...result, json: JSON.parse(result.stdout) as CheckJson };
};

describe('check on the sample layered project', async () => {
  const root = await copyFixture('layered');

  it('detects every planted violation and exits 3', () => {
    const { code, json, stderr } = checkJson(root);
    expect(code).toBe(3);
    expect(json.result).toBe('failed');
    expect(json.violations.map((v) => `${v.severity} ${v.ruleId} ${v.file}`)).toEqual(
      EXPECTED_LAYERED_VIOLATIONS,
    );
    expect(json.summary).toEqual({ rules: 5, enabledRules: 5, errors: 5, warnings: 2 });
    expect(stderr).toContain('Architecture check failed: 5 failing violations.');
  });

  it('prints a readable text report', () => {
    const result = runCli(['check'], root);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain('layer-boundaries                         3 violations');
    expect(result.stdout).toContain(
      'Layer "domain" must not depend on layer "infrastructure" (allowed for "domain": none).',
    );
    expect(result.stdout).toContain('imports: "../infrastructure/db/connection" import 2:22');
    expect(result.stdout).toContain('Analysis: complete (20 files, 26 dependencies).');
    expect(result.stdout).not.toContain('fingerprint:');
    expect(runCli(['check', '--verbose'], root).stdout).toMatch(/fingerprint: [0-9a-f]{16}/);
  });

  it('emits deterministic JSON without absolute paths, stable across relocation', async () => {
    const first = checkJson(root);
    const again = checkJson(root);
    expect(again.stdout).toBe(first.stdout);
    expect(first.stdout).not.toContain(root);
    expect(first.stdout).not.toContain(root.split(path.sep).join('/'));
    const relocated = checkJson(await copyFixture('layered'));
    expect(relocated.stdout).toBe(first.stdout);
    const fingerprints = first.json.violations.map((v) => v.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('checks another directory given as an argument', () => {
    const result = runCli(['check', root], path.dirname(root));
    expect(result.code).toBe(3);
  });
});

describe('check exit codes', () => {
  async function project(rules: string, files: Record<string, string>) {
    const root = await makeTempDir();
    await writeTree(root, {
      ...files,
      'deptrace.yml': `version: 1\nproject:\n  name: t\nanalysis:\n  include: ["**/*"]\n  exclude: []\n${rules}`,
    });
    return root;
  }
  const layers =
    'layers:\n  - { name: ui, files: ["src/ui/**"] }\n  - { name: core, files: ["src/core/**"] }\n';

  it('passes (exit 0) for a clean repository', async () => {
    const root = await project(
      `${layers}rules:\n  layer-boundaries:\n    allowed: { ui: [core], core: [] }\n  circular-dependencies: {}\n`,
      { 'src/ui/page.ts': "import '../core/model';", 'src/core/model.ts': 'export {};' },
    );
    const result = runCli(['check'], root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Violations: none');
    expect(result.stdout).toContain('Architecture check passed.');
    expect(result.stderr).toBe('');
  });

  it('passes with warnings by default, and fails with --strict', async () => {
    const root = await project('rules:\n  circular-dependencies:\n    severity: warning\n', {
      'a.ts': "import './b';",
      'b.ts': "import './a';",
    });
    const normal = runCli(['check'], root);
    expect(normal.code).toBe(0);
    expect(normal.stdout).toContain('Architecture check passed with 1 warning(s).');
    const strict = checkJson(root, ['--strict']);
    expect(strict.code).toBe(3);
    expect(strict.json).toMatchObject({ result: 'failed', strict: true });
    expect(strict.stderr).toContain('strict mode');
  });

  it('passes when every rule is off', async () => {
    const root = await project('rules:\n  circular-dependencies:\n    severity: off\n', {
      'a.ts': "import './b';",
      'b.ts': "import './a';",
    });
    const result = runCli(['check'], root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('not evaluated');
  });

  it('reports unresolved imports as an incomplete analysis, not as violations', async () => {
    const root = await project(
      `${layers}rules:\n  layer-boundaries:\n    allowed: { ui: [], core: [] }\n`,
      {
        'src/ui/page.ts': "import '../core/missing';",
      },
    );
    const result = runCli(['check'], root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Analysis: completed with diagnostics');
    expect(result.stdout).toContain('unresolved or unanalyzable imports are not checked');
  });

  it('rejects an invalid policy with exit 2 and a precise message', async () => {
    const root = await project(
      `${layers}rules:\n  layer-boundaries:\n    allowed: { ui: [domain], core: [] }\n`,
      {},
    );
    const result = runCli(['check'], root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      'rules.layer-boundaries.allowed.ui[0]: unknown layer "domain" (defined: "ui", "core")',
    );
  });

  it('never modifies deptrace.yml', async () => {
    const root = await copyFixture('layered');
    const before = await readFile(path.join(root, 'deptrace.yml'), 'utf8');
    runCli(['check'], root);
    runCli(['report'], root);
    expect(await readFile(path.join(root, 'deptrace.yml'), 'utf8')).toBe(before);
  });
});

describe('report', async () => {
  const root = await copyFixture('layered');

  it('shows layers, layer dependencies, rule results and cycles, and exits 0', () => {
    const result = runCli(['report'], root);
    expect(result.code).toBe(0);
    for (const text of [
      'DepTrace architecture report',
      'presentation         2 files    src/presentation/**',
      '(no layer)           7 files',
      'domain -> infrastructure                 1 edge  NOT ALLOWED',
      'infrastructure -> domain                 2 edges  allowed',
      'layer-boundaries                         3 violations',
      'Circular dependencies: 2 cyclic components',
    ]) {
      expect(result.stdout).toContain(text);
    }
  });

  it('emits the scan document plus an architecture section as JSON', () => {
    const result = runCli(['report', '--format', 'json'], root);
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout) as {
      schemaVersion: number;
      nodes: unknown[];
      architecture: {
        layers: { name: string; files: string[] }[];
        unlayeredFiles: string[];
        layerDependencies: { from: string; to: string; edges: number }[];
        violations: unknown[];
        errors: number;
      };
    };
    expect(json.schemaVersion).toBe(1);
    expect(json.nodes).toHaveLength(20);
    expect(json.architecture.layers.map((l) => [l.name, l.files.length])).toEqual([
      ['presentation', 2],
      ['application', 2],
      ['domain', 6],
      ['infrastructure', 3],
    ]);
    expect(json.architecture.unlayeredFiles).toContain('src/main.ts');
    expect(json.architecture.violations).toHaveLength(7);
    expect(json.architecture.errors).toBe(5);
  });

  it('accepts a deptrace.yml with "rules: []" written by older versions', async () => {
    const dir = await makeTempDir();
    await writeFile(
      path.join(dir, 'deptrace.yml'),
      'version: 1\nproject:\n  name: old\nanalysis:\n  include:\n    - src/**/*.ts\n  exclude:\n    - node_modules/**\nrules: []\n',
    );
    expect(runCli(['report'], dir).code).toBe(0);
    expect(runCli(['scan'], dir).code).toBe(0);
  });
});
