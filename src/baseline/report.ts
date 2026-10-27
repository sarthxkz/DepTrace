import {
  failingViolations,
  type toArchitectureSection,
  type toCheckDocument,
} from '../rules/json.js';
import type { Violation } from '../rules/types.js';
import type { BaselineComparison } from './baseline.js';

/** Marks every violation `new` or `existing`. Existing violations stay in the list. */
function classify(violations: Violation[], comparison: BaselineComparison) {
  const isNew = new Set(comparison.new.map((violation) => violation.fingerprint));
  return violations.map((violation) => ({
    ...violation,
    baselineStatus: isNew.has(violation.fingerprint) ? ('new' as const) : ('existing' as const),
  }));
}

function baselineSection(comparison: BaselineComparison, file: string) {
  return {
    file,
    new: comparison.new.length,
    existing: comparison.existing.length,
    resolved: comparison.resolved.length,
    resolvedViolations: comparison.resolved,
  };
}

/**
 * The `check --format json` document in baseline mode: the outcome counts
 * only new violations, and every violation says whether the baseline accepts it.
 * Existing violations stay in the list; nothing is hidden.
 */
export function toBaselineCheckDocument(
  document: ReturnType<typeof toCheckDocument>,
  comparison: BaselineComparison,
  file: string,
  strict: boolean,
) {
  const failing = failingViolations(comparison.new, strict).length;
  return {
    ...document,
    result: failing > 0 ? ('failed' as const) : ('passed' as const),
    summary: { ...document.summary, failing },
    violations: classify(document.violations, comparison),
    baseline: baselineSection(comparison, file),
  };
}

/** The `architecture` section of `report --format json --baseline <file>`. */
export function toBaselineArchitectureSection(
  section: ReturnType<typeof toArchitectureSection>,
  comparison: BaselineComparison,
  file: string,
) {
  return {
    ...section,
    violations: classify(section.violations, comparison),
    baseline: baselineSection(comparison, file),
  };
}
