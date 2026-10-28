import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Real analyzer output for tests/fixtures/storefront (see docs/dashboard.md to regenerate). */
export const fixtureText = (
  name:
    | 'storefront-report.json'
    | 'storefront-check.json'
    | 'storefront-audit.json'
    | 'storefront.sarif',
) => readFileSync(path.join(FIXTURES, name), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- tests name the shape they read
export const fixture = <T extends object = Record<string, unknown>>(
  name:
    | 'storefront-report.json'
    | 'storefront-check.json'
    | 'storefront-audit.json'
    | 'storefront.sarif',
) => JSON.parse(fixtureText(name)) as T;

/** Narrows away null and undefined, failing the test when the value is missing. */
export function defined<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Expected a value');
  return value;
}

/**
 * A synthetic report document with `files` modules in `folders` folders,
 * each importing the next one in its folder. Used for large-graph behavior.
 */
export function syntheticReport(files: number, folders = 50): Record<string, unknown> {
  const report = fixture<
    Record<string, unknown> & {
      summary: Record<string, number>;
      architecture: Record<string, unknown>;
    }
  >('storefront-report.json');
  const ids = Array.from(
    { length: files },
    (_, i) => `src/f${String(i % folders).padStart(3, '0')}/m${String(i).padStart(6, '0')}.ts`,
  ).sort();
  const edges = [];
  for (let i = 1; i < ids.length; i++) {
    const from = ids[i - 1] ?? '';
    const to = ids[i] ?? '';
    edges.push({
      from,
      to,
      typeOnly: false,
      references: [{ specifier: './x', kind: 'import', typeOnly: false, line: 1, column: 1 }],
    });
  }
  return {
    ...report,
    summary: {
      ...report.summary,
      nodes: files,
      edges: edges.length,
      cyclicComponents: 0,
      runtimeCycles: 0,
    },
    nodes: ids.map((id) => ({ id, path: id, extension: '.ts', status: 'parsed', tsconfig: null })),
    edges,
    cycles: [],
    externalDependencies: [],
    unresolvedDependencies: [],
    excludedDependencies: [],
    diagnostics: [],
    architecture: {
      layers: [],
      unlayeredFiles: ids,
      layerDependencies: [],
      layerRule: null,
      rules: [],
      violations: [],
      errors: 0,
      warnings: 0,
    },
  };
}
