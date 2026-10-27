/**
 * Loads any document the dashboard accepts and normalizes findings:
 *
 * - `deptrace report --format json`: the full dashboard (graph, layers, cycles, findings).
 * - `deptrace check --format json` / `check --report <file>`: findings only.
 * - SARIF 2.1.0 (`check --sarif`, or another tool's log): findings only.
 */
import { Checker, quote, ValidationError } from './checker.js';
import {
  baselineSummary,
  parseReport,
  ruleResult,
  SUPPORTED_SCHEMA_VERSION,
  violation,
  type BaselineSummary,
  type ImportRef,
  type Report,
  type RuleResult,
  type Target,
  type Violation,
} from './report.js';

/** Same limit as `deptrace dashboard --report`. */
export const MAX_REPORT_BYTES = 64 * 1024 * 1024;

export interface Finding {
  /** Unique within the document: the fingerprint, or the SARIF result position. */
  id: string;
  ruleId: string;
  ruleDescription: string | null;
  severity: 'error' | 'warning' | 'note';
  file: string | null;
  line: number | null;
  column: number | null;
  target: Target | null;
  message: string;
  path: string[] | null;
  references: ImportRef[];
  dependencyKinds: string[];
  typeOnly: boolean | null;
  fingerprint: string | null;
  /** Only when the document carries a baseline comparison. */
  baselineStatus: 'new' | 'existing' | null;
}

export type Loaded =
  | { kind: 'report'; report: Report; findings: Finding[] }
  | {
      kind: 'findings';
      format: 'check' | 'sarif';
      tool: { name: string; version: string | null };
      findings: Finding[];
      rules: RuleResult[] | null;
      baseline: BaselineSummary | null;
    };

export class LoadError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'LoadError';
  }
}

export function fromViolation(v: Violation): Finding {
  return {
    id: v.fingerprint,
    ruleId: v.ruleId,
    ruleDescription: v.ruleDescription,
    severity: v.severity,
    file: v.file,
    line: v.line,
    column: v.column,
    target: v.target,
    message: v.message,
    path: v.path,
    references: v.references,
    dependencyKinds: v.dependencyKinds,
    typeOnly: v.typeOnly,
    fingerprint: v.fingerprint,
    baselineStatus: v.baselineStatus,
  };
}

function parseCheckDocument(value: unknown): Loaded {
  const c = new Checker();
  return c.run(() => {
    const o = c.object(value, '$');
    if (o.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      c.problem('schemaVersion', `expected ${String(SUPPORTED_SCHEMA_VERSION)}`);
    }
    const tool = c.object(o.tool, 'tool');
    const violations = c.array(o, 'violations', '$', (item, at) => violation(c, item, at));
    const baseline = o.baseline === undefined ? null : baselineSummary(c, o.baseline, 'baseline');
    return {
      kind: 'findings' as const,
      format: 'check' as const,
      tool: { name: c.string(tool, 'name', 'tool'), version: c.string(tool, 'version', 'tool') },
      findings: violations.map(fromViolation),
      rules: c.array(o, 'rules', '$', (item, at) => ruleResult(c, item, at)),
      baseline,
    };
  });
}

const SARIF_LEVELS = { error: 'error', warning: 'warning', note: 'note', none: 'note' } as const;

function decodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

function parseSarif(value: unknown): Loaded {
  const c = new Checker();
  return c.run(() => {
    const o = c.object(value, '$');
    const findings: Finding[] = [];
    let tool: { name: string; version: string | null } = { name: '', version: null };
    const seen = { baseline: false };
    c.array(o, 'runs', '$', (runValue, runAt) => {
      const run = c.object(runValue, runAt);
      const driver = c.object(c.object(run.tool, `${runAt}.tool`).driver, `${runAt}.tool.driver`);
      if (tool.name === '') {
        tool = {
          name: c.string(driver, 'name', `${runAt}.tool.driver`),
          version: typeof driver.version === 'string' ? driver.version : null,
        };
      }
      const descriptions = new Map<string, string>();
      if (Array.isArray(driver.rules)) {
        for (const rule of driver.rules as unknown[]) {
          const r = rule as { id?: unknown; shortDescription?: { text?: unknown } } | null;
          if (typeof r?.id === 'string' && typeof r.shortDescription?.text === 'string') {
            descriptions.set(r.id, r.shortDescription.text);
          }
        }
      }
      c.array(run, 'results', runAt, (resultValue, at) => {
        const result = c.object(resultValue, at);
        const message = c.object(result.message, `${at}.message`);
        const level = result.level ?? 'warning';
        if (typeof level !== 'string' || !(level in SARIF_LEVELS)) {
          c.problem(
            `${at}.level`,
            `unknown level ${typeof level === 'string' ? quote(level) : '(not a string)'}`,
          );
        }
        const ruleId = typeof result.ruleId === 'string' ? result.ruleId : '(no rule id)';
        const location = Array.isArray(result.locations)
          ? (result.locations[0] as Record<string, unknown> | undefined)
          : undefined;
        const physical = location?.physicalLocation as Record<string, unknown> | undefined;
        const artifact = physical?.artifactLocation as Record<string, unknown> | undefined;
        const region = physical?.region as Record<string, unknown> | undefined;
        const fingerprints = result.partialFingerprints as Record<string, unknown> | undefined;
        const fingerprint = fingerprints?.['deptrace/v1'];
        const state = result.baselineState;
        if (state !== undefined) seen.baseline = true;
        findings.push({
          id: `${runAt}/${at}`,
          ruleId,
          ruleDescription: descriptions.get(ruleId) ?? null,
          severity:
            typeof level === 'string' && level in SARIF_LEVELS
              ? SARIF_LEVELS[level as keyof typeof SARIF_LEVELS]
              : 'warning',
          file: typeof artifact?.uri === 'string' ? decodeUri(artifact.uri) : null,
          line: typeof region?.startLine === 'number' ? region.startLine : null,
          column: typeof region?.startColumn === 'number' ? region.startColumn : null,
          target: null,
          message: c.string(message, 'text', `${at}.message`),
          path: null,
          references: [],
          dependencyKinds: [],
          typeOnly: null,
          fingerprint: typeof fingerprint === 'string' ? fingerprint : null,
          baselineStatus: state === 'new' ? 'new' : state === 'unchanged' ? 'existing' : null,
        });
      });
    });
    return {
      kind: 'findings' as const,
      format: 'sarif' as const,
      tool,
      // A partial baselineState would make the missing ones look accepted; drop it.
      findings:
        seen.baseline && findings.every((f) => f.baselineStatus !== null)
          ? findings
          : findings.map((f) => ({ ...f, baselineStatus: null })),
      rules: null,
      baseline: null,
    };
  });
}

/** Parses and validates a document's text. Throws LoadError with a readable message. */
export function parseDocument(text: string): Loaded {
  if (text.length > MAX_REPORT_BYTES) {
    throw new LoadError(`The file is larger than ${String(MAX_REPORT_BYTES / 1024 / 1024)} MB.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new LoadError(
      `The file is not valid JSON (${error instanceof Error ? error.message : 'parse error'}).`,
    );
  }
  return parseValue(value);
}

/** Validates an already parsed document (e.g. the server's response). */
export function parseValue(value: unknown): Loaded {
  const o = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  try {
    if (o.version === '2.1.0' && Array.isArray(o.runs)) return parseSarif(value);
    if ('nodes' in o || 'architecture' in o) {
      const report = parseReport(value);
      return {
        kind: 'report',
        report,
        findings: report.architecture.violations.map(fromViolation),
      };
    }
    if ('result' in o && 'violations' in o) return parseCheckDocument(value);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new LoadError('The file does not match a format DepTrace supports.', error.problems);
    }
    throw error;
  }
  throw new LoadError(
    'This is not a DepTrace report, a DepTrace check report or a SARIF 2.1.0 log. Create one with "deptrace report --format json".',
  );
}

/** Reads a user-selected file, refusing oversized files before reading them. */
export async function readDocumentFile(file: File): Promise<Loaded> {
  if (file.size > MAX_REPORT_BYTES) {
    throw new LoadError(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${String(MAX_REPORT_BYTES / 1024 / 1024)} MB.`,
    );
  }
  return parseDocument(await file.text());
}
