import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { analyzeRepository } from '../../src/analysis/analyze.js';
import { DEFAULT_INCLUDE } from '../../src/analysis/discovery.js';
import { validateConfig } from '../../src/config/schema.js';
import { parsePolicy } from '../../src/rules/config.js';
import { evaluatePolicy } from '../../src/rules/evaluate.js';
import { fingerprint } from '../../src/rules/fingerprint.js';
import { createLayerResolver, createModuleResolver } from '../../src/rules/layers.js';
import { compileMatcher, patternProblem } from '../../src/rules/patterns.js';
import { copyFixture, FIXTURES, makeTempDir, writeTree } from '../helpers.js';

const base = { version: 1, project: { name: 'x' }, analysis: { include: ['**/*'], exclude: [] } };

/** Parses YAML for `layers` and `rules`, failing the test on configuration problems. */
function policyFrom(yaml: string) {
  const value = parse(yaml) as { layers?: unknown; rules?: unknown };
  const { policy, problems } = parsePolicy(value.layers, value.rules);
  expect(problems).toEqual([]);
  return policy;
}

async function evaluate(files: Record<string, string>, yaml: string) {
  const root = await makeTempDir();
  await writeTree(root, files);
  const result = await analyzeRepository(root, {
    include: DEFAULT_INCLUDE,
    exclude: [],
    configFile: null,
  });
  return evaluatePolicy(result, policyFrom(yaml));
}

const summary = (evaluation: Awaited<ReturnType<typeof evaluate>>) =>
  evaluation.violations.map((v) => {
    const target =
      v.target.kind === 'file'
        ? v.target.path
        : v.target.kind === 'package'
          ? `package:${v.target.name}`
          : `cycle:${v.target.files.join(',')}`;
    return `${v.severity} ${v.ruleId} ${v.file} -> ${target}`;
  });

const LAYERS = `
layers:
  - name: ui
    files: ["src/ui/**"]
  - name: domain
    files: ["src/domain/**"]
  - name: infra
    files: ["src/infra/**"]
`;

describe('configuration validation', () => {
  const problemsOf = (yaml: string) => validateConfig({ ...base, ...(parse(yaml) as object) });

  it('accepts the sample layered project configuration', async () => {
    const { readFile } = await import('node:fs/promises');
    const yaml = await readFile(path.join(FIXTURES, 'layered', 'deptrace.yml'), 'utf8');
    expect(validateConfig(parse(yaml))).toEqual([]);
  });

  it('keeps accepting the pre-rules format "rules: []"', () => {
    expect(problemsOf('rules: []')).toEqual([]);
  });

  it.each([
    [
      'an unknown rule type',
      'rules:\n  layer-boundary: {}',
      'rules.layer-boundary: unknown setting',
    ],
    [
      'a typo in a rule setting',
      `${LAYERS}rules:\n  circular-dependencies:\n    severty: error`,
      'rules.circular-dependencies.severty: unknown setting',
    ],
    [
      'an invalid severity',
      'rules:\n  circular-dependencies:\n    severity: fatal',
      'must be one of "error", "warning", "off"',
    ],
    [
      'an unknown layer in allowed',
      `${LAYERS}rules:\n  layer-boundaries:\n    allowed: { ui: [domian], domain: [], infra: [] }`,
      'rules.layer-boundaries.allowed.ui[0]: unknown layer "domian"',
    ],
    [
      'a layer missing from allowed',
      `${LAYERS}rules:\n  layer-boundaries:\n    allowed: { ui: [domain], domain: [] }`,
      'missing layer "infra"',
    ],
    [
      'layer-boundaries without layers',
      'rules:\n  layer-boundaries:\n    allowed: {}',
      'requires "layers" to be defined',
    ],
    [
      'a duplicate layer',
      'layers:\n  - { name: a, files: ["a/**"] }\n  - { name: a, files: ["b/**"] }',
      'duplicate layer name "a"',
    ],
    [
      'a layer without files',
      'layers:\n  - { name: a, files: [] }',
      'layers[0].files: must not be empty',
    ],
    [
      'a named rule without a name',
      'rules:\n  forbidden-imports:\n    - { from: ["a/**"], to: ["b/**"] }',
      'rules.forbidden-imports[0].name: must be a non-empty string',
    ],
    [
      'duplicate rule names',
      'rules:\n  forbidden-imports:\n    - { name: x, from: ["a/**"], to: ["b/**"] }\n    - { name: x, from: ["c/**"], to: ["d/**"] }',
      'duplicate rule id "forbidden-imports/x"',
    ],
    [
      'a pattern escaping the root',
      'rules:\n  forbidden-imports:\n    - { name: x, from: ["../**"], to: ["b/**"] }',
      'must be relative to the repository root',
    ],
    [
      'an empty package list',
      'rules:\n  forbidden-packages:\n    - { name: x, packages: [] }',
      'must be a non-empty list of package names',
    ],
    [
      'a non-boolean ignore-type-only',
      'rules:\n  circular-dependencies:\n    ignore-type-only: "yes"',
      'must be true or false',
    ],
    [
      'a single object where a list is expected',
      'rules:\n  forbidden-packages:\n    name: x\n    packages: [y]',
      'must be a list of rules, each with a "name"',
    ],
  ])('reports %s', (_label, yaml, problem) => {
    expect(problemsOf(yaml).join('\n')).toContain(problem);
  });
});

describe('patterns and resolvers', () => {
  it('matches root-relative paths including dotfiles', () => {
    const matches = compileMatcher(['src/**']);
    expect(matches('src/a.ts')).toBe(true);
    expect(matches('src/.hidden/a.ts')).toBe(true);
    expect(matches('lib/a.ts')).toBe(false);
    expect(compileMatcher([])('anything')).toBe(false);
  });

  it('rejects unsafe patterns', () => {
    expect(patternProblem('src\\**')).toContain('forward slashes');
    expect(patternProblem('C:/src/**')).toContain('relative');
    expect(patternProblem('src/../../**')).toContain('relative');
    expect(patternProblem('src/**/*.ts')).toBeNull();
  });

  it('assigns a file to the first matching layer', () => {
    const layerOf = createLayerResolver([
      { name: 'special', files: ['src/domain/special/**'] },
      { name: 'domain', files: ['src/domain/**'] },
    ]);
    expect(layerOf('src/domain/special/a.ts')).toBe('special');
    expect(layerOf('src/domain/b.ts')).toBe('domain');
    expect(layerOf('src/other.ts')).toBeNull();
  });

  it('maps files to the shallowest matching module directory', () => {
    const moduleOf = createModuleResolver(['src/features/*']);
    expect(moduleOf('src/features/cart/internal/state.ts')).toBe('src/features/cart');
    expect(moduleOf('src/features/cart.ts')).toBeNull();
    expect(moduleOf('src/shared/x.ts')).toBeNull();
  });
});

describe('layer-boundaries', () => {
  const files = {
    'src/ui/page.ts': "import { a } from '../domain/a';\nimport { db } from '../infra/db';",
    'src/domain/a.ts':
      "import { b } from './b';\nimport type { T } from '../infra/types';\nexport const a = b;",
    'src/domain/b.ts': 'export const b = 1;',
    'src/infra/db.ts': "import { a } from '../domain/a';\nexport const db = a;",
    'src/infra/types.ts': 'export type T = 1;',
    'src/main.ts': "import { db } from './infra/db';\nimport { a } from './domain/a';",
  };
  const rules = `${LAYERS}
rules:
  layer-boundaries:
    allowed:
      ui: [domain]
      domain: []
      infra: [domain]
`;

  it('reports forbidden directions only (same layer and unlayered files are not checked)', async () => {
    expect(summary(await evaluate(files, rules))).toEqual([
      'error layer-boundaries src/domain/a.ts -> src/infra/types.ts',
      'error layer-boundaries src/ui/page.ts -> src/infra/db.ts',
    ]);
  });

  it('records the layers, dependency kind and location', async () => {
    const [violation] = (await evaluate(files, rules)).violations;
    expect(violation).toMatchObject({
      line: 2,
      column: 24,
      dependencyKinds: ['import'],
      typeOnly: true,
      metadata: { fromLayer: 'domain', toLayer: 'infra' },
      path: ['src/domain/a.ts', 'src/infra/types.ts'],
    });
  });

  it('ignores type-only imports when configured', async () => {
    const evaluation = await evaluate(files, `${rules}    ignore-type-only: true\n`);
    expect(summary(evaluation)).toEqual([
      'error layer-boundaries src/ui/page.ts -> src/infra/db.ts',
    ]);
  });

  it('exempts excluded importing files', async () => {
    const evaluation = await evaluate(files, `${rules}    exclude: ["src/ui/**"]\n`);
    expect(summary(evaluation)).toEqual([
      'error layer-boundaries src/domain/a.ts -> src/infra/types.ts',
    ]);
  });

  it('uses the configured severity, and evaluates nothing when off', async () => {
    const warning = await evaluate(files, `${rules}    severity: warning\n`);
    expect(warning.errors).toBe(0);
    expect(warning.warnings).toBe(2);
    const off = await evaluate(files, `${rules}    severity: off\n`);
    expect(off.violations).toEqual([]);
    expect(off.rules).toEqual([
      expect.objectContaining({ id: 'layer-boundaries', severity: 'off', violations: 0 }),
    ]);
  });
});

describe('forbidden-imports', () => {
  it('reports imports from "from" files to "to" files, except excluded importers', async () => {
    const evaluation = await evaluate(
      {
        'src/a.ts': "import './legacy/old';",
        'src/b.ts': "import './new';",
        'src/new.ts': '',
        'src/legacy/old.ts': "import './older';",
        'src/legacy/older.ts': '',
      },
      `rules:
  forbidden-imports:
    - name: no-legacy
      severity: warning
      from: ["src/**"]
      to: ["src/legacy/**"]
      exclude: ["src/legacy/**"]
`,
    );
    expect(summary(evaluation)).toEqual([
      'warning forbidden-imports/no-legacy src/a.ts -> src/legacy/old.ts',
    ]);
  });
});

describe('forbidden-packages', () => {
  const files = {
    'src/domain/a.ts':
      "import express from 'express';\nimport { Router } from 'express/lib/router';\nimport type { Pool } from 'pg';\nimport fs from 'node:fs';\nimport { Module } from '@nestjs/core';\nimport ok from 'zod';",
    'src/app.ts': "import express from 'express';",
    'node_modules/express/package.json': '{"name":"express","main":"index.js"}',
    'node_modules/express/index.js': '',
    'node_modules/express/lib/router.js': '',
    'node_modules/pg/package.json': '{"name":"pg","types":"index.d.ts"}',
    'node_modules/pg/index.d.ts': 'export declare class Pool {}',
  };
  const rule = (extra = '') => `rules:
  forbidden-packages:
    - name: pure-domain
      from: ["src/domain/**"]
      packages: ["express", "pg", "fs", "@nestjs/*"]
${extra}`;

  it('reports each forbidden package once per file, including built-ins and scoped globs', async () => {
    const evaluation = await evaluate(files, rule());
    expect(summary(evaluation)).toEqual([
      'error forbidden-packages/pure-domain src/domain/a.ts -> package:express',
      'error forbidden-packages/pure-domain src/domain/a.ts -> package:pg',
      'error forbidden-packages/pure-domain src/domain/a.ts -> package:fs',
      'error forbidden-packages/pure-domain src/domain/a.ts -> package:@nestjs/core',
    ]);
    const express = evaluation.violations[0];
    expect(express?.references.map((r) => r.specifier)).toEqual(['express', 'express/lib/router']);
  });

  it('matches imports of packages that are not installed, marking them unresolved', async () => {
    const nest = (await evaluate(files, rule())).violations.find(
      (v) => v.target.kind === 'package' && v.target.name === '@nestjs/core',
    );
    expect(nest?.target).toEqual({ kind: 'package', name: '@nestjs/core', resolved: false });
  });

  it('ignores type-only package imports when configured', async () => {
    const evaluation = await evaluate(files, rule('      ignore-type-only: true\n'));
    expect(summary(evaluation).some((line) => line.endsWith('package:pg'))).toBe(false);
  });
});

describe('module-boundaries', () => {
  it('allows public entry points and same-module imports, and reports internals', async () => {
    const evaluation = await evaluate(
      {
        'src/features/cart/index.ts': "export * from './internal/state';",
        'src/features/cart/internal/state.ts': "import './helper';",
        'src/features/cart/internal/helper.ts': '',
        'src/features/shop/page.ts': "import '../cart';\nimport '../cart/internal/state';",
        'src/app.ts': "import './features/cart/internal/state';",
      },
      `rules:
  module-boundaries:
    - name: features
      modules: ["src/features/*"]
      public: ["index.ts"]
`,
    );
    expect(summary(evaluation)).toEqual([
      'error module-boundaries/features src/features/shop/page.ts -> src/features/cart/internal/state.ts',
    ]);
    expect(evaluation.violations[0]?.metadata).toEqual({
      fromModule: 'src/features/shop',
      toModule: 'src/features/cart',
    });
  });
});

describe('circular-dependencies', () => {
  const files = {
    'src/a.ts': "import './b';",
    'src/b.ts': "import './a';",
    'src/t1.ts': "import type { T } from './t2';\nexport type U = 1;",
    'src/t2.ts': "import type { U } from './t1';\nexport type T = 1;",
    'src/ok.ts': "import './a';",
  };

  it('reports each cyclic component once with its path', async () => {
    const evaluation = await evaluate(
      files,
      'rules:\n  circular-dependencies:\n    severity: warning\n',
    );
    expect(summary(evaluation)).toEqual([
      'warning circular-dependencies src/a.ts -> cycle:src/a.ts,src/b.ts',
      'warning circular-dependencies src/t1.ts -> cycle:src/t1.ts,src/t2.ts',
    ]);
    expect(evaluation.violations[0]?.path).toEqual(['src/a.ts', 'src/b.ts', 'src/a.ts']);
    expect(evaluation.violations[1]?.typeOnly).toBe(true);
  });

  it('ignores type-only cycles when configured', async () => {
    const evaluation = await evaluate(
      files,
      'rules:\n  circular-dependencies:\n    ignore-type-only: true\n',
    );
    expect(summary(evaluation)).toEqual([
      'error circular-dependencies src/a.ts -> cycle:src/a.ts,src/b.ts',
    ]);
  });

  it('removes excluded files from cycle detection', async () => {
    const evaluation = await evaluate(
      files,
      'rules:\n  circular-dependencies:\n    exclude: ["src/b.ts", "src/t*.ts"]\n',
    );
    expect(evaluation.violations).toEqual([]);
  });

  it('is not reported without the rule, even when cycles exist', async () => {
    const evaluation = await evaluate(
      files,
      `${LAYERS}rules:\n  layer-boundaries:\n    allowed: { ui: [], domain: [], infra: [] }\n`,
    );
    expect(evaluation.violations).toEqual([]);
  });
});

describe('fingerprints and determinism', () => {
  const yaml =
    'rules:\n  forbidden-imports:\n    - { name: x, from: ["src/a.ts"], to: ["src/b.ts"] }\n  circular-dependencies: {}\n';
  const files = { 'src/a.ts': "import './b';", 'src/b.ts': "import './a';" };

  it('produces 16-hex fingerprints that differ by rule and target', () => {
    expect(fingerprint('r', 'a', 'b')).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint('r', 'a', 'b')).not.toBe(fingerprint('s', 'a', 'b'));
    expect(fingerprint('r', 'a', 'b')).not.toBe(fingerprint('r', 'a', 'c'));
    // Parts are separated, so ("ab", "c") and ("a", "bc") differ.
    expect(fingerprint('r', 'ab', 'c')).not.toBe(fingerprint('r', 'a', 'bc'));
  });

  it('keeps fingerprints when lines move or the repository is relocated', async () => {
    const first = await evaluate(files, yaml);
    const moved = await evaluate({ ...files, 'src/a.ts': "\n\n// moved\nimport './b';" }, yaml);
    expect(moved.violations.map((v) => v.fingerprint)).toEqual(
      first.violations.map((v) => v.fingerprint),
    );
    expect(moved.violations[0]?.line).not.toBe(first.violations[0]?.line);
  });

  it('never reports duplicate fingerprints, and sorts deterministically', async () => {
    const root = await copyFixture('layered');
    const result = await analyzeRepository(root, {
      include: ['src/**/*'],
      exclude: [],
      configFile: null,
    });
    const config = parse(
      await (await import('node:fs/promises')).readFile(path.join(root, 'deptrace.yml'), 'utf8'),
    ) as {
      layers: unknown;
      rules: unknown;
    };
    const { policy } = parsePolicy(config.layers, config.rules);
    const a = evaluatePolicy(result, policy);
    const b = evaluatePolicy(result, policy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const fingerprints = a.violations.map((v) => v.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('does not treat unresolved imports as violations', async () => {
    const root = await makeTempDir();
    await writeTree(root, { 'src/ui/a.ts': "import '../infra/missing';" });
    await writeFile(path.join(root, 'unused.txt'), '');
    const result = await analyzeRepository(root, {
      include: DEFAULT_INCLUDE,
      exclude: [],
      configFile: null,
    });
    const evaluation = evaluatePolicy(
      result,
      policyFrom(
        `${LAYERS}rules:\n  layer-boundaries:\n    allowed: { ui: [], domain: [], infra: [] }\n`,
      ),
    );
    expect(result.unresolved).toHaveLength(1);
    expect(evaluation.violations).toEqual([]);
  });
});
