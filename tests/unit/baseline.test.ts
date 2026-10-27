import { readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../../src/analysis/analyze.js';
import {
  compareWithBaseline,
  compatibilityProblems,
  configurationOf,
  createBaseline,
  parseBaseline,
  serializeBaseline,
  type Baseline,
} from '../../src/baseline/baseline.js';
import { readBaselineFile, writeBaselineFile } from '../../src/baseline/file.js';
import { loadConfig } from '../../src/config/load.js';
import { DepTraceError } from '../../src/core/errors.js';
import { parsePolicy } from '../../src/rules/config.js';
import { evaluatePolicy } from '../../src/rules/evaluate.js';
import { FINGERPRINT_VERSION } from '../../src/rules/fingerprint.js';
import type { Policy } from '../../src/rules/types.js';
import { copyFixture, defined, makeTempDir } from '../helpers.js';

async function evaluateFixture(root: string) {
  const config = await loadConfig(root);
  if (!config) throw new Error('fixture has no deptrace.yml');
  const result = await analyzeRepository(root, {
    include: config.analysis.include,
    exclude: config.analysis.exclude,
    configFile: 'deptrace.yml',
  });
  const { policy } = parsePolicy(config.layers, config.rules);
  const evaluation = evaluatePolicy(result, policy);
  const configuration = configurationOf(policy, config.analysis);
  return {
    policy,
    evaluation,
    configuration,
    baseline: createBaseline(evaluation, configuration, '1.2.3'),
  };
}

const root = await copyFixture('layered');
const fixture = await evaluateFixture(root);

/** A deep copy that tests may modify. */
const copy = (baseline: Baseline = fixture.baseline) =>
  JSON.parse(serializeBaseline(baseline)) as Baseline;

const problemsOf = (value: unknown) => parseBaseline(value).problems;

describe('fingerprints', () => {
  it('match golden values, so an algorithm change cannot slip through unversioned', () => {
    // If this fails, fingerprints changed: bump FINGERPRINT_VERSION and update these values.
    expect(FINGERPRINT_VERSION).toBe(1);
    expect(
      fixture.baseline.violations.map((v) => `${v.fingerprint} ${v.ruleId} ${v.file}`),
    ).toEqual([
      '4ed4d1d27dbaa65d circular-dependencies src/application/notify.ts',
      'b13788850723e07c forbidden-packages/pure-domain src/domain/pricing.ts',
      '63d9639e32a7e374 layer-boundaries src/domain/pricing.ts',
      '81bfb3a61edb633d module-boundaries/features src/features/catalog/ui/catalog-page.ts',
      '41c182ec8a8cb3da layer-boundaries src/infrastructure/http/server.ts',
      '238825c28b2b1c2b forbidden-imports/no-legacy src/presentation/cli.ts',
      '827f158c27762752 layer-boundaries src/presentation/cli.ts',
    ]);
  });

  it('are the same for a copy of the repository in another directory', async () => {
    const elsewhere = await evaluateFixture(await copyFixture('layered'));
    expect(serializeBaseline(elsewhere.baseline)).toBe(serializeBaseline(fixture.baseline));
  });

  it('do not change when an offending import moves to another line', async () => {
    const moved = await copyFixture('layered');
    const file = path.join(moved, 'src/domain/pricing.ts');
    await writeFile(file, `\n\n// moved down\n${await readFile(file, 'utf8')}`);
    const after = await evaluateFixture(moved);
    expect(after.baseline.violations.map((v) => v.fingerprint)).toEqual(
      fixture.baseline.violations.map((v) => v.fingerprint),
    );
    expect(after.evaluation.violations.map((v) => v.line)).not.toEqual(
      fixture.evaluation.violations.map((v) => v.line),
    );
  });
});

describe('baseline creation', () => {
  it('is deterministic and contains no absolute paths, line numbers or timestamps', () => {
    const text = serializeBaseline(fixture.baseline);
    expect(
      serializeBaseline(createBaseline(fixture.evaluation, fixture.configuration, '1.2.3')),
    ).toBe(text);
    expect(text).not.toContain(root);
    expect(text).not.toContain(root.split(path.sep).join('/'));
    expect(text).not.toMatch(/"line"|"column"|20\d\d-\d\d-\d\d/);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('records the format, the fingerprint version and the enabled rules', () => {
    const { baseline } = fixture;
    expect(baseline).toMatchObject({
      schemaVersion: 1,
      tool: { name: 'deptrace', version: '1.2.3' },
      fingerprintVersion: FINGERPRINT_VERSION,
    });
    expect(Object.keys(baseline.configuration.rules)).toEqual([
      'circular-dependencies',
      'forbidden-imports/no-legacy',
      'forbidden-packages/pure-domain',
      'layer-boundaries',
      'module-boundaries/features',
    ]);
    expect(parseBaseline(copy())).toEqual({ baseline: copy(), problems: [] });
  });

  it('records an empty list for a clean repository', () => {
    const clean = createBaseline(
      { rules: [], violations: [], errors: 0, warnings: 0 },
      fixture.configuration,
      '1',
    );
    expect(clean.violations).toEqual([]);
    expect(parseBaseline(copy(clean)).problems).toEqual([]);
  });
});

describe('baseline comparison', () => {
  const { evaluation } = fixture;

  it('classifies everything as existing when nothing changed', () => {
    const comparison = compareWithBaseline(fixture.baseline, evaluation.violations);
    expect(comparison.new).toEqual([]);
    expect(comparison.existing).toHaveLength(7);
    expect(comparison.resolved).toEqual([]);
  });

  it('classifies new, existing and resolved violations', () => {
    const baseline = copy();
    const [removed] = baseline.violations.splice(2, 1);
    baseline.violations.push({
      ...defined(baseline.violations[0]),
      fingerprint: '0123456789abcdef',
      file: 'src/gone.ts',
    });
    const comparison = compareWithBaseline(baseline, evaluation.violations);
    expect(comparison.new.map((v) => v.fingerprint)).toEqual([defined(removed).fingerprint]);
    expect(comparison.existing).toHaveLength(6);
    expect(comparison.resolved.map((entry) => entry.file)).toEqual(['src/gone.ts']);
  });

  it('treats an empty baseline as all-new, and no violations as all-resolved', () => {
    expect(
      compareWithBaseline({ ...copy(), violations: [] }, evaluation.violations).new,
    ).toHaveLength(7);
    expect(compareWithBaseline(copy(), []).resolved).toHaveLength(7);
  });
});

describe('baseline compatibility', () => {
  const policyWith = (change: (policy: Policy) => void) => {
    const policy = structuredClone(fixture.policy);
    change(policy);
    return configurationOf(policy, { include: ['src/**/*'], exclude: [] });
  };
  const current = fixture.configuration;

  it('accepts the same configuration, also with reordered settings or another severity', () => {
    expect(compatibilityProblems(fixture.baseline, current)).toEqual([]);
    const reordered = policyWith((policy) => {
      const rule = policy.rules.find((r) => r.type === 'layer-boundaries');
      if (rule?.type === 'layer-boundaries') {
        rule.allowed = Object.fromEntries(Object.entries(rule.allowed).reverse());
        rule.severity = 'warning';
        rule.description = 'changed wording';
      }
    });
    expect(reordered).toEqual(current);
  });

  it('reports added, removed, turned-off and changed rules, and changed analysis scope', () => {
    const changed = policyWith((policy) => {
      const packages = policy.rules.find((r) => r.type === 'forbidden-packages');
      if (packages?.type === 'forbidden-packages') packages.packages.push('lodash');
      const cycles = policy.rules.find((r) => r.type === 'circular-dependencies');
      if (cycles) cycles.severity = 'off';
      policy.rules = policy.rules.filter((r) => r.type !== 'module-boundaries');
      defined(policy.layers[0]).files.push('src/ui/**');
    });
    const scope = configurationOf(fixture.policy, { include: ['src/**'], exclude: [] });
    expect(
      compatibilityProblems(fixture.baseline, { ...changed, analysis: scope.analysis }),
    ).toEqual([
      'analysis.include or analysis.exclude changed',
      'rule "circular-dependencies" was removed or turned off',
      'rule "forbidden-packages/pure-domain" changed',
      'rule "layer-boundaries" changed',
      'rule "module-boundaries/features" was removed or turned off',
    ]);
    const added = {
      ...current,
      rules: { ...current.rules, 'forbidden-imports/new': 'ffffffffffffffff' },
    };
    expect(compatibilityProblems(fixture.baseline, added)).toEqual([
      'rule "forbidden-imports/new" is enabled but not in the baseline',
    ]);
  });

  it('rejects another fingerprint version', () => {
    expect(compatibilityProblems({ ...copy(), fingerprintVersion: 2 }, current)).toEqual([
      `the baseline uses fingerprint version 2, this DepTrace uses version ${String(FINGERPRINT_VERSION)}`,
    ]);
  });
});

describe('baseline validation', () => {
  it('rejects unsupported or missing schema versions', () => {
    expect(problemsOf({ ...copy(), schemaVersion: 2 })).toEqual([
      'unsupported schemaVersion 2 (this DepTrace supports 1; the baseline was written by a newer DepTrace)',
    ]);
    expect(problemsOf({ violations: [] })[0]).toContain('unsupported schemaVersion (missing)');
    expect(problemsOf([])).toEqual(['the baseline must be a JSON object']);
  });

  it('rejects malformed structure with located messages', () => {
    const baseline = copy() as unknown as Record<string, unknown>;
    expect(problemsOf({ ...baseline, extra: 1, tool: { name: 'other', version: '1' } })).toEqual([
      '"extra": unknown field',
      'tool: must be { "name": "deptrace", "version": "<version>" }',
    ]);
    expect(problemsOf({ ...baseline, configuration: { analysis: 'x', rules: {} } })).toEqual([
      'configuration: must contain an "analysis" digest and a "rules" digest map',
    ]);
    expect(problemsOf({ ...baseline, violations: {} })).toEqual(['violations: must be a list']);
  });

  it('rejects malformed entries, unknown rules and unsafe paths', () => {
    const baseline = copy();
    const entry = defined(baseline.violations[0]);
    baseline.violations = [
      { ...entry, fingerprint: 'XYZ', ruleId: 'constructor' },
      { ...entry, fingerprint: '1111111111111111', file: '../outside.ts' },
      {
        ...entry,
        fingerprint: '2222222222222222',
        file: 'C:/abs.ts',
        target: { kind: 'file', path: '/etc/passwd' },
      },
      {
        ...entry,
        fingerprint: '3333333333333333',
        file: 'src\\win.ts',
        target: { kind: 'cycle', files: ['a/./b.ts'] },
      },
      {
        ...entry,
        fingerprint: '4444444444444444',
        file: 'a\nb.ts',
        target: { kind: 'other' } as never,
      },
    ];
    expect(problemsOf(baseline)).toEqual([
      'violations[0].fingerprint: must be 16 lowercase hex characters',
      'violations[0].ruleId: must name a rule listed in configuration.rules',
      'violations[1].file: must be a repository-relative path with forward slashes',
      'violations[2].file: must be a repository-relative path with forward slashes',
      'violations[2].target: path must be a repository-relative path',
      'violations[3].file: must be a repository-relative path with forward slashes',
      'violations[3].target: files must be a list of repository-relative paths',
      'violations[4].file: must be a repository-relative path with forward slashes',
      'violations[4].target: kind must be "file", "package" or "cycle"',
    ]);
  });

  it('rejects duplicate fingerprints instead of counting them twice', () => {
    const baseline = copy();
    baseline.violations.push(defined(baseline.violations[3]));
    expect(problemsOf(baseline)).toEqual([
      `violations[7]: duplicate fingerprint ${defined(baseline.violations[3]).fingerprint} (first at violations[3])`,
    ]);
  });

  it('caps the number of problems and makes them printable', () => {
    const baseline = copy();
    baseline.violations = Array.from({ length: 100 }, () => ({ bogus: true }) as never);
    const problems = problemsOf(baseline);
    expect(problems).toHaveLength(20);
    expect(problemsOf({ ...copy(), ['a\n::error::x']: 1 })).toEqual([
      '"a\\n::error::x": unknown field',
    ]);
  });
});

describe('baseline files', () => {
  it('creates a file, refuses to overwrite it, and replaces it only with update', async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, 'baseline.json');
    await writeBaselineFile(file, fixture.baseline, 'create');
    expect(await readFile(file, 'utf8')).toBe(serializeBaseline(fixture.baseline));

    const before = await readFile(file, 'utf8');
    await expect(
      writeBaselineFile(file, copy({ ...fixture.baseline, violations: [] }), 'create'),
    ).rejects.toThrow(/already exists .* not modified/);
    expect(await readFile(file, 'utf8')).toBe(before);

    await writeBaselineFile(file, { ...fixture.baseline, violations: [] }, 'update');
    expect((await readBaselineFile(file)).violations).toEqual([]);
  });

  it('update requires an existing file; neither mode leaves temporary files behind', async () => {
    const dir = await makeTempDir();
    await expect(
      writeBaselineFile(path.join(dir, 'b.json'), fixture.baseline, 'update'),
    ).rejects.toThrow(/No baseline to update/);
    await writeBaselineFile(path.join(dir, 'b.json'), fixture.baseline, 'create');
    await writeBaselineFile(path.join(dir, 'b.json'), fixture.baseline, 'update');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(dir)).toEqual(['b.json']);
  });

  it.skipIf(process.platform === 'win32')(
    'does not follow a planted symlink on create',
    async () => {
      const dir = await makeTempDir();
      const victim = path.join(dir, 'victim.txt');
      await writeFile(victim, 'keep');
      await symlink(victim, path.join(dir, 'b.json'));
      await expect(
        writeBaselineFile(path.join(dir, 'b.json'), fixture.baseline, 'create'),
      ).rejects.toThrow(/already exists/);
      expect(await readFile(victim, 'utf8')).toBe('keep');
    },
  );

  it('reports missing, non-JSON and invalid files as usage errors (exit 2)', async () => {
    const dir = await makeTempDir();
    const expectUsage = async (file: string, message: RegExp) => {
      const error: unknown = await readBaselineFile(file).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DepTraceError);
      expect((error as DepTraceError).exitCode).toBe(2);
      expect((error as DepTraceError).message).toMatch(message);
    };
    await expectUsage(path.join(dir, 'missing.json'), /Baseline file not found/);
    await expectUsage(dir, /not a file/);
    await writeFile(path.join(dir, 'bad.json'), '{ "schemaVersion": 1,');
    await expectUsage(path.join(dir, 'bad.json'), /not valid JSON/);
    await writeFile(path.join(dir, 'empty.json'), '');
    await expectUsage(path.join(dir, 'empty.json'), /not valid JSON/);
    await writeFile(path.join(dir, 'v2.json'), JSON.stringify({ ...copy(), schemaVersion: 2 }));
    await expectUsage(path.join(dir, 'v2.json'), /unsupported schemaVersion 2/);
  });

  it('accepts a file with a byte order mark', async () => {
    const file = path.join(await makeTempDir(), 'bom.json');
    await writeFile(file, `${String.fromCharCode(0xfeff)}${serializeBaseline(fixture.baseline)}`);
    expect((await readBaselineFile(file)).violations).toHaveLength(7);
  });
});
