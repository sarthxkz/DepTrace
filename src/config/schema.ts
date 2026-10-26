/** Current configuration format version written by `deptrace init`. */
export const CONFIG_VERSION = 1;

/** The configuration fields supported by format version 1. */
export interface DepTraceConfig {
  version: typeof CONFIG_VERSION;
  project: { name: string };
  analysis: { include: string[]; exclude: string[] };
  /** Rules are not implemented yet; only an empty list is accepted. */
  rules: [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Patterns are matched against root-relative paths, so they cannot point outside the root. */
function isRelativePattern(pattern: string): boolean {
  return (
    pattern.length > 0 &&
    !pattern.startsWith('/') &&
    !/^[a-zA-Z]:/.test(pattern) &&
    !pattern.split(/[\\/]/).includes('..')
  );
}

/** Validates a parsed configuration object. Returns a list of problems (empty when valid). */
export function validateConfig(value: unknown): string[] {
  if (!isRecord(value)) return ['configuration must be a mapping'];
  const problems: string[] = [];
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
      } else if (patterns.some((pattern) => !isRelativePattern(pattern))) {
        problems.push(
          `analysis.${key} patterns must be relative to the repository root (no leading "/", drive letter or ".." segment)`,
        );
      }
    }
  }
  if (!Array.isArray(value.rules) || value.rules.length > 0) {
    problems.push('rules must be an empty list (rules are not supported in this version)');
  }
  return problems;
}
