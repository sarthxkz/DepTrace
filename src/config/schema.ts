import { parsePolicy } from '../rules/config.js';
import { patternProblem } from '../rules/patterns.js';

/** Current configuration format version written by `deptrace init`. */
export const CONFIG_VERSION = 1;

/** The configuration fields supported by format version 1 (as parsed from YAML). */
export interface DepTraceConfig {
  version: typeof CONFIG_VERSION;
  project: { name: string };
  analysis: { include: string[]; exclude: string[] };
  /** Architecture layers; see docs/rules.md. Validated by `parsePolicy`. */
  layers?: unknown;
  /** `[]` (no rules) or a mapping of rule types; see docs/rules.md. */
  rules: unknown;
}

const TOP_LEVEL_KEYS = ['version', 'project', 'analysis', 'layers', 'rules'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Validates a parsed configuration object. Returns a list of problems (empty when valid). */
export function validateConfig(value: unknown): string[] {
  if (!isRecord(value)) return ['configuration must be a mapping'];
  const problems: string[] = [];
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      problems.push(`${key}: unknown setting (supported: ${TOP_LEVEL_KEYS.join(', ')})`);
    }
  }
  if (value.version !== CONFIG_VERSION) {
    problems.push(`version must be ${String(CONFIG_VERSION)}`);
  }
  if (!isRecord(value.project) || typeof value.project.name !== 'string' || !value.project.name) {
    problems.push('project.name must be a non-empty string');
  }
  if (!isRecord(value.analysis)) {
    problems.push('analysis must be a mapping');
  } else {
    for (const key of ['include', 'exclude'] as const) {
      const patterns = value.analysis[key];
      if (!isStringArray(patterns)) {
        problems.push(`analysis.${key} must be a list of strings`);
        continue;
      }
      for (const pattern of patterns) {
        const problem = patternProblem(pattern);
        if (problem) problems.push(`analysis.${key} patterns ${problem} (got "${pattern}")`);
      }
    }
  }
  problems.push(...parsePolicy(value.layers, value.rules).problems);
  return problems;
}
