import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../../src/analysis/analyze.js';
import {
  compareWithBaseline,
  configurationOf,
  createBaseline,
} from '../../src/baseline/baseline.js';
import {
  escapeData,
  escapeProperty,
  formatAnnotations,
  formatSummary,
  markdownText,
} from '../../src/cli/github.js';
import { loadConfig } from '../../src/config/load.js';
import { parsePolicy } from '../../src/rules/config.js';
import { evaluatePolicy } from '../../src/rules/evaluate.js';
import { toSarif } from '../../src/rules/sarif.js';
import type { PolicyEvaluation, Violation } from '../../src/rules/types.js';
import { copyFixture, defined } from '../helpers.js';
import { sarifValidator } from '../schemas.js';

const root = await copyFixture('layered');
const config = defined(await loadConfig(root));
const result = await analyzeRepository(root, {
  include: config.analysis.include,
  exclude: config.analysis.exclude,
  configFile: 'deptrace.yml',
});
const { policy } = parsePolicy(config.layers, config.rules);
const evaluation = evaluatePolicy(result, policy);
const sample = defined(evaluation.violations.find((v) => v.ruleId === 'layer-boundaries'));

/** `count` copies of a violation in different files, with a given severity. */
const many = (count: number, severity: 'error' | 'warning' = 'error'): Violation[] =>
  Array.from({ length: count }, (_, index) => ({
    ...sample,
    severity,
    file: `src/f${String(index).padStart(3, '0')}.ts`,
    fingerprint: index.toString(16).padStart(16, '0'),
  }));

const withViolations = (violations: Violation[]): PolicyEvaluation => ({
  ...evaluation,
  violations,
  errors: violations.filter((v) => v.severity === 'error').length,
  warnings: violations.filter((v) => v.severity === 'warning').length,
});

describe('GitHub annotations', () => {
  it('escapes workflow command data and properties like @actions/core', () => {
    expect(escapeData('50% done\r\n::error::x')).toBe('50%25 done%0D%0A::error::x');
    expect(escapeProperty('a:b,c%\n')).toBe('a%3Ab%2Cc%25%0A');
  });

  it('annotates at the source location relative to the repository root', () => {
    expect(formatAnnotations([sample], 'packages/shop/')).toEqual([
      `::error file=packages/shop/${sample.file},line=${String(sample.line)},col=${String(sample.column)},title=DepTrace layer-boundaries::${sample.message}`,
    ]);
  });

  it('cannot be broken out of by malicious file names or messages', () => {
    const evil = {
      ...sample,
      file: 'src/a,line=1::x\n::warning::pwned%0A.ts',
      line: null,
      message: 'msg\n::set-output name=x::y',
    };
    const [line, ...rest] = formatAnnotations([evil], '');
    expect(rest).toEqual([]);
    expect(line).toBe(
      '::error file=src/a%2Cline=1%3A%3Ax%0A%3A%3Awarning%3A%3Apwned%250A.ts,title=DepTrace layer-boundaries::msg%0A::set-output name=x::y',
    );
  });

  it('emits at most 10 per severity, then a notice', () => {
    const lines = formatAnnotations([...many(15), ...many(12, 'warning')], '');
    expect(lines.filter((l) => l.startsWith('::error '))).toHaveLength(10);
    expect(lines.filter((l) => l.startsWith('::warning '))).toHaveLength(10);
    expect(lines.at(-1)).toBe(
      '::notice title=DepTrace::7 more violations are not annotated; see the job summary or the JSON report.',
    );
  });

  it('bounds the message length', () => {
    const [line] = formatAnnotations([{ ...sample, message: 'x'.repeat(5000) }], '');
    expect(defined(line).length).toBeLessThan(1200);
  });
});

describe('Markdown summary', () => {
  it('escapes Markdown and HTML in repository-controlled text', () => {
    const text = markdownText('a|b <script>`x`</script> [l](http://e) **b**\n# h');
    expect(text).toBe(
      'a\\|b \\<script\\>\\`x\\`\\<\\/script\\> \\[l\\]\\(http\\:\\/\\/e\\) \\*\\*b\\*\\* \\# h',
    );
    expect(text).not.toMatch(/[^\\][|<>`[\]]/);
  });

  const summaryOf = (violations: Violation[], baseline = false) => {
    const current = withViolations(violations);
    const comparison = baseline
      ? compareWithBaseline(
          createBaseline(
            withViolations(violations.slice(0, 2)),
            configurationOf(policy, config.analysis),
            '1',
          ),
          violations,
        )
      : undefined;
    return formatSummary({
      result,
      evaluation: current,
      baseline: comparison && { file: 'deptrace-baseline.json', comparison },
      strict: false,
      failing: (comparison?.new ?? violations).filter((v) => v.severity === 'error').length,
      reportFile: 'deptrace-report.json',
    });
  };

  it('reports a failed full check with violations, rules, files and next steps', () => {
    const text = summaryOf(evaluation.violations);
    expect(text).toContain('## DepTrace architecture check: failed');
    expect(text).toContain('**5 failing violations**.');
    expect(text).toContain('Mode: full architecture check.');
    expect(text).toContain('| All current | 5 | 2 | 7 |');
    expect(text).toContain('| layer\\-boundaries | error | 3 |');
    expect(text).toContain('### Most affected files');
    expect(text).toContain('`deptrace baseline create`');
    expect(text).toContain('Full report: deptrace\\-report\\.json.');
  });

  it('reports a passing check', () => {
    const text = summaryOf([]);
    expect(text).toContain('## DepTrace architecture check: passed');
    expect(text).toContain('No failing violations.');
    expect(text).not.toContain('### Violations');
  });

  it('separates new, existing and resolved violations in baseline mode', () => {
    const text = summaryOf(many(5), true);
    expect(text).toContain('**3 failing violations** not in the baseline.');
    expect(text).toContain('| New | 3 | 0 | 3 |');
    expect(text).toContain('| Existing (in baseline) | 2 | 0 | 2 |');
    expect(text).toContain('### New violations');
    expect(text).not.toContain('src\\/f000\\.ts:'); // existing ones are not listed as new
  });

  it('stays bounded for thousands of violations', () => {
    const text = summaryOf(many(5000));
    expect(text).toContain('_Showing 30 of 5000 violations; the JSON report lists all._');
    expect(text).toContain('_Showing 10 of 5000 files; the JSON report lists all._');
    expect(text.length).toBeLessThan(30_000);
  });
});

describe('SARIF', () => {
  const validate = sarifValidator();
  const expectValid = (log: unknown) => {
    const valid = validate(log);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  };

  it('is valid SARIF 2.1.0 (official OASIS schema), deterministic and relative', () => {
    const log = toSarif(evaluation, '1.2.3', { pathPrefix: '' });
    expectValid(log);
    expect(JSON.stringify(toSarif(evaluation, '1.2.3', { pathPrefix: '' }))).toBe(
      JSON.stringify(log),
    );
    expect(JSON.stringify(log)).not.toContain(root.split(path.sep).join('/'));
    expect(JSON.stringify(log)).not.toContain(root);
  });

  it('maps rules, levels, locations and fingerprints', () => {
    const run = defined(toSarif(evaluation, '1.2.3', { pathPrefix: 'apps/shop/' }).runs[0]);
    expect(run.tool.driver.rules.map((r) => [r.id, r.defaultConfiguration.level])).toEqual(
      evaluation.rules.map((r) => [r.id, r.severity]),
    );
    expect(run.results).toHaveLength(7);
    for (const [index, sarif] of run.results.entries()) {
      const violation = defined(evaluation.violations[index]);
      expect(run.tool.driver.rules[sarif.ruleIndex ?? -1]?.id).toBe(sarif.ruleId);
      expect(sarif.level).toBe(violation.severity);
      expect(sarif.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
        `apps/shop/${violation.file}`,
      );
      expect(sarif.locations[0]?.physicalLocation.region?.startLine).toBe(violation.line);
      expect(sarif.partialFingerprints).toEqual({ 'deptrace/v1': violation.fingerprint });
      expect(sarif).not.toHaveProperty('baselineState');
    }
  });

  it('encodes unusual file names as URI references and marks baseline state', () => {
    const odd = {
      ...sample,
      file: 'src/my file #1%.ts',
      target: { kind: 'file' as const, path: 'src/ä.ts' },
    };
    const log = toSarif(withViolations([odd, ...many(1)]), '1', {
      pathPrefix: '',
      newFingerprints: new Set([odd.fingerprint]),
    });
    expectValid(log);
    const [first, second] = defined(log.runs[0]).results;
    expect(first?.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
      'src/my%20file%20%231%25.ts',
    );
    expect(first?.relatedLocations?.[0]?.physicalLocation.artifactLocation.uri).toBe(
      'src/%C3%A4.ts',
    );
    expect([first?.baselineState, second?.baselineState]).toEqual(['new', 'unchanged']);
  });

  it('the schema rejects invalid logs (the validator is not a no-op)', () => {
    const invalid = {
      version: '2.1.0',
      runs: [{ tool: { driver: {} }, results: [{ level: 'fatal' }] }],
    };
    expect(validate(invalid)).toBe(false);
  });

  it('is valid without violations', () => {
    expectValid(toSarif(withViolations([]), '1', { pathPrefix: '' }));
  });
});
