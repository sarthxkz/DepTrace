import { Option } from 'commander';

export type OutputFormat = 'text' | 'json';

export const formatOption = () =>
  new Option('--format <format>', 'output format').choices(['text', 'json']).default('text');

export const rootOption = () =>
  new Option('-r, --root <directory>', 'repository root to analyze').default('.');

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Loads the analysis runner on demand: it pulls in the TypeScript compiler
 * (~0.5 s to load), which commands like --help and init do not need.
 */
export const loadAnalysis = () => import('./analysis.js');
