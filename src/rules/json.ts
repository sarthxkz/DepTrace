import { JSON_SCHEMA_VERSION } from '../analysis/json.js';
import type { AnalysisResult } from '../analysis/types.js';
import { CLI_NAME } from '../core/constants.js';
import { summarizeLayers } from './evaluate.js';
import type { LayerBoundariesRule, Policy, PolicyEvaluation, Violation } from './types.js';

export type CheckOutcome = 'passed' | 'failed';

/** Violations that fail a check: errors, and with strict also warnings. */
export function failingViolations(violations: Violation[], strict: boolean): Violation[] {
  return violations.filter((violation) => strict || violation.severity === 'error');
}

/** Whether a check fails: any error violation, or (strict) any warning violation. */
export function checkOutcome(evaluation: PolicyEvaluation, strict: boolean): CheckOutcome {
  return failingViolations(evaluation.violations, strict).length > 0 ? 'failed' : 'passed';
}

function analysisSummary(result: AnalysisResult) {
  return {
    status: result.status,
    errors: result.summary.errors,
    warnings: result.summary.warnings,
    unresolvedReferences: result.summary.unresolvedReferences,
    filesWithParseErrors: result.summary.filesWithParseErrors,
  };
}

/** JSON document for `deptrace check --format json`. */
export function toCheckDocument(
  result: AnalysisResult,
  evaluation: PolicyEvaluation,
  strict: boolean,
  toolVersion: string,
) {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    tool: { name: CLI_NAME, version: toolVersion },
    result: checkOutcome(evaluation, strict),
    strict,
    summary: {
      rules: evaluation.rules.length,
      enabledRules: evaluation.rules.filter((rule) => rule.severity !== 'off').length,
      errors: evaluation.errors,
      warnings: evaluation.warnings,
      failing: failingViolations(evaluation.violations, strict).length,
    },
    analysis: analysisSummary(result),
    rules: evaluation.rules,
    violations: evaluation.violations,
  };
}

/** The `architecture` section added to the scan document by `deptrace report --format json`. */
export function toArchitectureSection(
  result: AnalysisResult,
  policy: Policy,
  evaluation: PolicyEvaluation,
) {
  const { layers, unlayered, dependencies } = summarizeLayers(result, policy);
  const layerRule = policy.rules.find(
    (rule): rule is LayerBoundariesRule => rule.type === 'layer-boundaries',
  );
  return {
    layers: layers.map((layer) => ({
      name: layer.name,
      patterns: policy.layers.find((entry) => entry.name === layer.name)?.files ?? [],
      files: layer.files,
    })),
    unlayeredFiles: unlayered,
    layerDependencies: dependencies,
    /** The configured layer policy (importer layer → layers it may import), or null. */
    layerRule: layerRule
      ? { id: layerRule.id, severity: layerRule.severity, allowed: layerRule.allowed }
      : null,
    rules: evaluation.rules,
    violations: evaluation.violations,
    errors: evaluation.errors,
    warnings: evaluation.warnings,
  };
}
