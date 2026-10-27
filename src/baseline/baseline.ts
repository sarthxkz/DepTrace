import { createHash } from 'node:crypto';
import { CLI_NAME } from '../core/constants.js';
import { printable } from '../core/errors.js';
import { FINGERPRINT_VERSION } from '../rules/fingerprint.js';
import type { Policy, PolicyEvaluation, Violation, ViolationTarget } from '../rules/types.js';

export const BASELINE_SCHEMA_VERSION = 1;
export const DEFAULT_BASELINE_FILENAME = 'deptrace-baseline.json';

/** An accepted violation. Only `fingerprint` is compared; the rest is for reviewers. */
export interface BaselineEntry {
  fingerprint: string;
  ruleId: string;
  file: string;
  target: ViolationTarget;
  message: string;
}

/** What the baseline was approved against; a mismatch makes it incompatible. */
export interface BaselineConfiguration {
  /** Digest of `analysis.include` and `analysis.exclude`. */
  analysis: string;
  /** Enabled rule id → digest of its definition (severity and description excluded). */
  rules: Record<string, string>;
}

export interface Baseline {
  schemaVersion: typeof BASELINE_SCHEMA_VERSION;
  /** Informational: the DepTrace version that wrote the file. */
  tool: { name: string; version: string };
  fingerprintVersion: number;
  configuration: BaselineConfiguration;
  /** Sorted by file, rule id, then fingerprint; fingerprints are unique. */
  violations: BaselineEntry[];
}

export interface AnalysisScope {
  include: string[];
  exclude: string[];
}

export interface BaselineComparison {
  /** Current violations missing from the baseline. */
  new: Violation[];
  /** Current violations the baseline accepts. */
  existing: Violation[];
  /** Baseline entries no longer found. */
  resolved: BaselineEntry[];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** JSON with sorted object keys, so YAML key order does not change digests. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => compare(a, b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex').slice(0, 16);

/**
 * Digests of everything that decides which violations exist. Severity and
 * description are left out: changing them does not change what is found.
 */
export function configurationOf(policy: Policy, scope: AnalysisScope): BaselineConfiguration {
  const rules: Record<string, string> = {};
  const enabled = policy.rules.filter((rule) => rule.severity !== 'off');
  for (const rule of [...enabled].sort((a, b) => compare(a.id, b.id))) {
    const definition = { ...rule, severity: undefined, description: undefined };
    // Layer definitions only matter to layer-boundaries, so they are part of its digest.
    rules[rule.id] = digest(
      rule.type === 'layer-boundaries' ? { ...definition, layers: policy.layers } : definition,
    );
  }
  return { analysis: digest({ include: scope.include, exclude: scope.exclude }), rules };
}

export function createBaseline(
  evaluation: PolicyEvaluation,
  configuration: BaselineConfiguration,
  toolVersion: string,
): Baseline {
  const violations = evaluation.violations
    .map(({ fingerprint, ruleId, file, target, message }) => ({
      fingerprint,
      ruleId,
      file,
      target,
      message,
    }))
    .sort(
      (a, b) =>
        compare(a.file, b.file) ||
        compare(a.ruleId, b.ruleId) ||
        compare(a.fingerprint, b.fingerprint),
    );
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: { name: CLI_NAME, version: toolVersion },
    fingerprintVersion: FINGERPRINT_VERSION,
    configuration,
    violations,
  };
}

export function serializeBaseline(baseline: Baseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

export function compareWithBaseline(
  baseline: Baseline,
  violations: Violation[],
): BaselineComparison {
  const accepted = new Set(baseline.violations.map((entry) => entry.fingerprint));
  const current = new Set(violations.map((violation) => violation.fingerprint));
  return {
    new: violations.filter((violation) => !accepted.has(violation.fingerprint)),
    existing: violations.filter((violation) => accepted.has(violation.fingerprint)),
    resolved: baseline.violations.filter((entry) => !current.has(entry.fingerprint)),
  };
}

/**
 * Why `baseline` cannot be compared with the current configuration (empty
 * when compatible). Never treat an incompatible baseline as empty.
 */
export function compatibilityProblems(
  baseline: Baseline,
  current: BaselineConfiguration,
): string[] {
  if (baseline.fingerprintVersion !== FINGERPRINT_VERSION) {
    return [
      `the baseline uses fingerprint version ${String(baseline.fingerprintVersion)}, this DepTrace uses version ${String(FINGERPRINT_VERSION)}`,
    ];
  }
  const problems: string[] = [];
  if (baseline.configuration.analysis !== current.analysis) {
    problems.push('analysis.include or analysis.exclude changed');
  }
  const ids = [
    ...new Set([...Object.keys(baseline.configuration.rules), ...Object.keys(current.rules)]),
  ].sort(compare);
  for (const id of ids) {
    const before = baseline.configuration.rules[id];
    const now = current.rules[id];
    if (before === undefined) problems.push(`rule "${id}" is enabled but not in the baseline`);
    else if (now === undefined) problems.push(`rule "${id}" was removed or turned off`);
    else if (before !== now) problems.push(`rule "${id}" changed`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Validation of baseline files (untrusted input: they come from the repository)

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const HASH = /^[0-9a-f]{16}$/;
const MAX_PROBLEMS = 20;

/** A repository-relative path with forward slashes that stays inside the repository. */
function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value !== '' &&
    !value.startsWith('/') &&
    !/^[a-zA-Z]:/.test(value) &&
    !value.includes('\\') &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f]/.test(value) &&
    !value.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
  );
}

function unknownKeys(value: Raw, allowed: string[], at: string, problems: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push(`${at}${JSON.stringify(key)}: unknown field`);
  }
}

function targetProblem(target: unknown): string | null {
  if (!isRecord(target)) return 'must be an object';
  switch (target.kind) {
    case 'file':
      return isSafeRelativePath(target.path) ? null : 'path must be a repository-relative path';
    case 'package':
      return typeof target.name === 'string' &&
        target.name !== '' &&
        typeof target.resolved === 'boolean'
        ? null
        : 'must have a package "name" and a boolean "resolved"';
    case 'cycle':
      return Array.isArray(target.files) &&
        target.files.length > 0 &&
        target.files.every(isSafeRelativePath)
        ? null
        : 'files must be a list of repository-relative paths';
    default:
      return 'kind must be "file", "package" or "cycle"';
  }
}

function entryProblems(entry: unknown, at: string, rules: Raw | null): string[] {
  if (!isRecord(entry)) return [`${at}: must be an object`];
  const problems: string[] = [];
  unknownKeys(entry, ['fingerprint', 'ruleId', 'file', 'target', 'message'], `${at}.`, problems);
  if (typeof entry.fingerprint !== 'string' || !HASH.test(entry.fingerprint)) {
    problems.push(`${at}.fingerprint: must be 16 lowercase hex characters`);
  }
  // Without a valid rule list (already reported), rule ids cannot be checked.
  if (rules && (typeof entry.ruleId !== 'string' || !Object.hasOwn(rules, entry.ruleId))) {
    problems.push(`${at}.ruleId: must name a rule listed in configuration.rules`);
  }
  if (!isSafeRelativePath(entry.file)) {
    problems.push(`${at}.file: must be a repository-relative path with forward slashes`);
  }
  const target = targetProblem(entry.target);
  if (target) problems.push(`${at}.target: ${target}`);
  if (typeof entry.message !== 'string') problems.push(`${at}.message: must be a string`);
  return problems;
}

/**
 * Validates parsed baseline JSON. Returns the baseline, or the problems found
 * (at most MAX_PROBLEMS, printable).
 */
export function parseBaseline(
  value: unknown,
): { baseline: Baseline; problems: [] } | { baseline: null; problems: string[] } {
  const fail = (problems: string[]) => ({
    baseline: null,
    problems: problems.slice(0, MAX_PROBLEMS).map(printable),
  });
  if (!isRecord(value)) return fail(['the baseline must be a JSON object']);
  if (value.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    const newer = typeof value.schemaVersion === 'number' && value.schemaVersion > 1;
    return fail([
      `unsupported schemaVersion ${value.schemaVersion === undefined ? '(missing)' : JSON.stringify(value.schemaVersion)} (this DepTrace supports ${String(BASELINE_SCHEMA_VERSION)}${newer ? '; the baseline was written by a newer DepTrace' : ''})`,
    ]);
  }

  const problems: string[] = [];
  unknownKeys(
    value,
    ['schemaVersion', 'tool', 'fingerprintVersion', 'configuration', 'violations'],
    '',
    problems,
  );
  const { tool, configuration, violations } = value;
  if (!isRecord(tool) || tool.name !== CLI_NAME || typeof tool.version !== 'string') {
    problems.push(`tool: must be { "name": "${CLI_NAME}", "version": "<version>" }`);
  }
  if (!Number.isInteger(value.fingerprintVersion)) {
    problems.push('fingerprintVersion: must be an integer');
  }
  let rules: Raw | null = null;
  if (
    !isRecord(configuration) ||
    typeof configuration.analysis !== 'string' ||
    !HASH.test(configuration.analysis) ||
    !isRecord(configuration.rules) ||
    Object.values(configuration.rules).some((hash) => typeof hash !== 'string' || !HASH.test(hash))
  ) {
    problems.push('configuration: must contain an "analysis" digest and a "rules" digest map');
  } else {
    unknownKeys(configuration, ['analysis', 'rules'], 'configuration.', problems);
    rules = configuration.rules;
  }

  if (!Array.isArray(violations)) {
    problems.push('violations: must be a list');
  } else {
    const seen = new Map<string, number>();
    for (const [index, entry] of (violations as unknown[]).entries()) {
      const at = `violations[${String(index)}]`;
      problems.push(...entryProblems(entry, at, rules));
      const key = isRecord(entry) && typeof entry.fingerprint === 'string' && entry.fingerprint;
      if (key) {
        const first = seen.get(key);
        if (first === undefined) seen.set(key, index);
        else
          problems.push(
            `${at}: duplicate fingerprint ${key} (first at violations[${String(first)}])`,
          );
      }
      if (problems.length >= MAX_PROBLEMS) break;
    }
  }
  return problems.length > 0
    ? fail(problems)
    : { baseline: value as unknown as Baseline, problems: [] };
}
