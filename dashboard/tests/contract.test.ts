import { describe, expect, it } from 'vitest';
import { MAX_PROBLEMS } from '../src/contract/checker';
import {
  LoadError,
  MAX_REPORT_BYTES,
  parseDocument,
  parseValue,
  readDocumentFile,
} from '../src/contract/load';
import { defined, fixture, fixtureText } from './helpers';

type Json = Record<string, unknown> & {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  cycles: Record<string, unknown>[];
  summary: Record<string, unknown>;
  architecture: Record<string, unknown> & {
    layers: { name: string; files: string[] }[];
    violations: Record<string, unknown>[];
  };
};

const report = () => fixture<Json>('storefront-report.json');

function problemsOf(value: unknown): string[] {
  try {
    parseValue(value);
  } catch (error) {
    if (error instanceof LoadError) return [error.message, ...error.problems];
    throw error;
  }
  throw new Error('Expected the document to be rejected');
}

describe('report documents', () => {
  it('loads real analyzer output', () => {
    const loaded = parseDocument(fixtureText('storefront-report.json'));
    expect(loaded.kind).toBe('report');
    if (loaded.kind !== 'report') return;
    expect(loaded.report.nodes).toHaveLength(23);
    expect(loaded.report.edges).toHaveLength(35);
    expect(loaded.report.cycles).toHaveLength(2);
    expect(loaded.report.architecture.layers.map((l) => l.name)).toEqual([
      'ui',
      'application',
      'domain',
      'infrastructure',
      'shared',
    ]);
    expect(loaded.report.architecture.layerRule?.allowed.ui).toEqual(['application', 'shared']);
    expect(loaded.findings).toHaveLength(5);
    expect(loaded.findings.filter((f) => f.baselineStatus === 'new')).toHaveLength(1);
    expect(loaded.report.architecture.baseline?.resolved).toBe(1);
  });

  it('accepts a byte order mark', () => {
    expect(
      parseDocument(String.fromCharCode(0xfeff) + fixtureText('storefront-report.json')).kind,
    ).toBe('report');
  });

  it('treats a missing layerRule (older reports) as unknown, not as "no rule"', () => {
    const value = report();
    delete value.architecture.layerRule;
    const loaded = parseValue(value);
    expect(loaded.kind === 'report' && loaded.report.architecture.layerRule).toBeUndefined();
  });

  it('rejects invalid JSON with the parser message', () => {
    expect(() => parseDocument('{"schemaVersion": 1,')).toThrow(/not valid JSON/);
  });

  it('rejects documents that are not a supported format', () => {
    expect(() => parseDocument('{"hello": "world"}')).toThrow(/not a DepTrace report/);
    expect(() => parseDocument('[1, 2, 3]')).toThrow(/not a DepTrace report/);
    expect(() => parseDocument('null')).toThrow(/not a DepTrace report/);
  });

  it('rejects unsupported and missing schema versions', () => {
    expect(problemsOf({ ...report(), schemaVersion: 2 }).join('\n')).toMatch(
      /schemaVersion: 2; this dashboard reads version 1 \(the report was written by a newer DepTrace\)/,
    );
    const value: Record<string, unknown> = report();
    delete value.schemaVersion;
    expect(problemsOf(value).join('\n')).toMatch(/schemaVersion: missing/);
  });

  it('names missing fields and wrong types with their location', () => {
    const value = report();
    delete value.summary.nodes;
    value.edges[0] = { ...value.edges[0], typeOnly: 'yes' };
    const problems = problemsOf(value);
    expect(problems).toContain('summary.nodes: missing');
    expect(problems).toContain('edges[0].typeOnly: expected true or false, found a string');
  });

  it('rejects duplicate node ids', () => {
    const value = report();
    value.nodes.push({ ...value.nodes[0] });
    expect(problemsOf(value).join('\n')).toMatch(
      /nodes\[23\]\.id: duplicate node id "src\/application/,
    );
  });

  it('rejects edges, cycles, layers and violations that point at unknown nodes', () => {
    const value = report();
    value.edges[0] = { ...value.edges[0], to: 'src/missing.ts' };
    defined(value.architecture.layers[0]).files.push('src/ghost.ts');
    value.architecture.violations[0] = {
      ...value.architecture.violations[0],
      file: '../etc/passwd',
    };
    const problems = problemsOf(value).join('\n');
    expect(problems).toMatch(/edges\[0\]\.to: refers to "src\/missing\.ts", which is not a node/);
    expect(problems).toMatch(/architecture\.layers\[0\]\.files\[4\]: refers to "src\/ghost\.ts"/);
    expect(problems).toMatch(/architecture\.violations\[0\]\.file: refers to "\.\.\/etc\/passwd"/);
  });

  it('rejects a cycle edge that is not in the graph', () => {
    const value = report();
    const cycle = defined(value.cycles[0]) as { edges: Record<string, unknown>[] };
    cycle.edges.push({
      from: 'src/shared/money.ts',
      to: 'src/main.ts',
      typeOnly: true,
      references: [],
    });
    expect(problemsOf(value).join('\n')).toMatch(
      /cycles\[0\]\.edges\[\d+\]: is not an edge of the graph/,
    );
  });

  it('rejects duplicate fingerprints and files in two layers', () => {
    const value = report();
    value.architecture.violations.push({ ...value.architecture.violations[0] });
    const layers = value.architecture.layers;
    defined(layers[1]).files.push(defined(defined(layers[0]).files[0]));
    const problems = problemsOf(value).join('\n');
    expect(problems).toMatch(/duplicate fingerprint/);
    expect(problems).toMatch(/is already in layer "ui"/);
  });

  it('rejects baseline statuses without a baseline section', () => {
    const value = report();
    delete value.architecture.baseline;
    expect(problemsOf(value).join('\n')).toMatch(
      /baselineStatus: present without a baseline section/,
    );
  });

  it(`lists at most ${String(MAX_PROBLEMS)} problems`, () => {
    const value = report();
    value.nodes = value.nodes.map((node) => ({ ...node, status: 42 }));
    const problems = problemsOf(value);
    expect(problems).toHaveLength(MAX_PROBLEMS + 2); // message + 20 problems + "stopped" line
    expect(problems.at(-1)).toMatch(/stopped after 20 problems/);
  });

  it('refuses oversized files before reading them', async () => {
    const huge = {
      name: 'huge.json',
      size: MAX_REPORT_BYTES + 1,
      text: () => Promise.reject(new Error('read')),
    };
    await expect(readDocumentFile(huge as unknown as File)).rejects.toThrow(/the limit is 64 MB/);
  });

  it('truncates long untrusted values in problem messages', () => {
    const value = report();
    value.edges[0] = { ...value.edges[0], to: `src/${'x'.repeat(500)}.ts` };
    const problem = defined(problemsOf(value).find((p) => p.startsWith('edges[0].to')));
    expect(problem.length).toBeLessThan(200);
  });
});

describe('findings-only documents', () => {
  it('loads a check report with baseline statuses', () => {
    const loaded = parseDocument(fixtureText('storefront-check.json'));
    expect(loaded.kind).toBe('findings');
    if (loaded.kind !== 'findings') return;
    expect(loaded.format).toBe('check');
    expect(loaded.findings).toHaveLength(5);
    expect(loaded.baseline?.new).toBe(1);
    expect(loaded.rules?.map((r) => r.id)).toContain('layer-boundaries');
  });

  it('loads a SARIF log, decoding URIs and mapping baselineState', () => {
    const loaded = parseDocument(fixtureText('storefront.sarif'));
    expect(loaded.kind).toBe('findings');
    if (loaded.kind !== 'findings') return;
    expect(loaded.format).toBe('sarif');
    expect(loaded.tool.name).toBe('DepTrace');
    expect(loaded.findings).toHaveLength(5);
    expect(loaded.findings.every((f) => f.fingerprint !== null && f.file?.startsWith('src/'))).toBe(
      true,
    );
    expect(loaded.findings.filter((f) => f.baselineStatus === 'new')).toHaveLength(1);
  });

  it('drops partial SARIF baseline states instead of guessing', () => {
    const sarif = fixture<{ runs: { results: Record<string, unknown>[] }[] }>('storefront.sarif');
    const results = defined(sarif.runs[0]).results;
    delete defined(results[0]).baselineState;
    const loaded = parseValue(sarif);
    expect(loaded.findings.every((f) => f.baselineStatus === null)).toBe(true);
  });

  it('rejects SARIF results without a message', () => {
    const sarif = fixture<{ runs: { results: Record<string, unknown>[] }[] }>('storefront.sarif');
    delete defined(defined(sarif.runs[0]).results[0]).message;
    expect(problemsOf(sarif).join('\n')).toMatch(
      /runs\[0\]\.results\[0\]\.message: expected an object/,
    );
  });
});
