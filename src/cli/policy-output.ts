import type { AnalysisResult } from '../analysis/types.js';
import type { BaselineComparison } from '../baseline/baseline.js';
import { CLI_NAME, PRODUCT_NAME } from '../core/constants.js';
import { summarizeLayers } from '../rules/evaluate.js';
import type { Policy, PolicyEvaluation, Violation } from '../rules/types.js';
import { formatReference } from './output.js';

const plural = (count: number, word: string, many = `${word}s`) =>
  `${String(count)} ${count === 1 ? word : many}`;

/** A baseline comparison, with the baseline file as displayed to the user. */
export interface BaselineView {
  file: string;
  comparison: BaselineComparison;
}

function formatViolation(violation: Violation, verbose: boolean, status: string): string[] {
  const location =
    violation.line === null
      ? violation.file
      : `${violation.file}:${String(violation.line)}:${String(violation.column ?? 1)}`;
  const lines = [
    `  ${violation.severity.padEnd(8)}${status}${location}  [${violation.ruleId}]`,
    `          ${violation.message}`,
  ];
  if (violation.target.kind !== 'cycle' && violation.references.length > 0) {
    lines.push(`          imports: ${violation.references.map(formatReference).join(', ')}`);
  }
  if (verbose) lines.push(`          fingerprint: ${violation.fingerprint}`);
  return lines;
}

export function formatRules(evaluation: PolicyEvaluation): string[] {
  if (evaluation.rules.length === 0) return ['Rules: none configured'];
  return [
    'Rules',
    ...evaluation.rules.map(
      (rule) =>
        `  ${rule.severity.padEnd(8)}${rule.id.padEnd(40)} ${
          rule.severity === 'off' ? 'not evaluated' : plural(rule.violations, 'violation')
        }`,
    ),
  ];
}

export function formatViolations(
  evaluation: PolicyEvaluation,
  verbose: boolean,
  baseline?: BaselineView,
): string[] {
  if (evaluation.violations.length === 0) return ['Violations: none'];
  const isNew = new Set(baseline?.comparison.new.map((violation) => violation.fingerprint));
  const status = (violation: Violation) =>
    baseline ? (isNew.has(violation.fingerprint) ? 'new       ' : 'existing  ') : '';
  return [
    `Violations: ${plural(evaluation.errors, 'error')}, ${plural(evaluation.warnings, 'warning')}`,
    ...evaluation.violations.flatMap((violation) =>
      formatViolation(violation, verbose, status(violation)),
    ),
  ];
}

function formatBaseline({ file, comparison }: BaselineView): string[] {
  const { resolved } = comparison;
  const lines = [
    `Baseline: ${file} (${String(comparison.new.length)} new, ${String(comparison.existing.length)} existing, ${String(resolved.length)} resolved)`,
  ];
  for (const entry of resolved) {
    lines.push(`  resolved  ${entry.file}  [${entry.ruleId}]`, `          ${entry.message}`);
  }
  if (resolved.length > 0) {
    lines.push(
      `  Remove resolved entries with "${CLI_NAME} baseline update" so they cannot return.`,
    );
  }
  return lines;
}

/** A note that rules only see what the analysis could resolve. */
export function formatAnalysisNote(result: AnalysisResult): string {
  return result.status === 'completed'
    ? `Analysis: complete (${plural(result.summary.nodes, 'file')}, ${plural(result.summary.edges, 'dependency', 'dependencies')}).`
    : `Analysis: completed with diagnostics (${plural(result.summary.errors, 'error')}, ${plural(result.summary.warnings, 'warning')}). ` +
        'Rules only check dependencies the analysis found; unresolved or unanalyzable imports are not checked. Run "deptrace scan" for details.';
}

export function formatCheck(
  result: AnalysisResult,
  evaluation: PolicyEvaluation,
  verbose: boolean,
  baseline?: BaselineView,
): string {
  return [
    `${PRODUCT_NAME} architecture check`,
    '',
    ...formatRules(evaluation),
    '',
    ...formatViolations(evaluation, verbose, baseline),
    '',
    ...(baseline ? [...formatBaseline(baseline), ''] : []),
    formatAnalysisNote(result),
  ].join('\n');
}

export function formatReport(
  result: AnalysisResult,
  policy: Policy,
  evaluation: PolicyEvaluation,
  verbose: boolean,
  baseline?: BaselineView,
): string {
  const { summary } = result;
  const { layers, unlayered, dependencies } = summarizeLayers(result, policy);
  const layerRule = policy.rules.find((rule) => rule.type === 'layer-boundaries');
  const lines = [
    `${PRODUCT_NAME} architecture report`,
    '',
    'Summary',
    `  Files analyzed:           ${String(summary.nodes)}`,
    `  Internal dependencies:    ${String(summary.edges)} (${String(summary.typeOnlyEdges)} type-only)`,
    `  External packages:        ${String(summary.externalPackages)}`,
    `  Unresolved imports:       ${String(summary.unresolvedReferences)}`,
    `  Cyclic components:        ${String(summary.cyclicComponents)} (${String(summary.runtimeCycles)} runtime)`,
    `  Rule violations:          ${plural(evaluation.errors, 'error')}, ${plural(evaluation.warnings, 'warning')}`,
    '',
  ];

  if (layers.length === 0) {
    lines.push('Layers: none defined (add "layers" to deptrace.yml)');
  } else {
    lines.push('Layers');
    for (const layer of layers) {
      const patterns = policy.layers.find((entry) => entry.name === layer.name)?.files ?? [];
      lines.push(
        `  ${layer.name.padEnd(20)} ${plural(layer.files.length, 'file').padEnd(10)} ${patterns.join(', ')}`,
      );
      if (verbose) for (const file of layer.files) lines.push(`    ${file}`);
    }
    lines.push(`  ${'(no layer)'.padEnd(20)} ${plural(unlayered.length, 'file')}`);
    lines.push('', 'Dependencies between layers (importer -> imported)');
    if (dependencies.length === 0) lines.push('  none');
    for (const dependency of dependencies) {
      const allowed =
        layerRule?.type === 'layer-boundaries'
          ? (layerRule.allowed[dependency.from] ?? []).includes(dependency.to)
            ? '  allowed'
            : '  NOT ALLOWED'
          : '';
      lines.push(
        `  ${`${dependency.from} -> ${dependency.to}`.padEnd(40)} ${plural(dependency.edges, 'edge')}${allowed}`,
      );
    }
  }

  lines.push(
    '',
    ...formatRules(evaluation),
    '',
    ...formatViolations(evaluation, verbose, baseline),
    '',
    ...(baseline ? [...formatBaseline(baseline), ''] : []),
  );
  if (result.cycles.length === 0) {
    lines.push('Circular dependencies: none found');
  } else {
    lines.push(`Circular dependencies: ${String(result.cycles.length)} cyclic components`);
    for (const [index, cycle] of result.cycles.entries()) {
      lines.push(
        `  ${String(index + 1)}. (${plural(cycle.nodes.length, 'file')}${cycle.runtime ? '' : ', type-only'}) ${cycle.representativePath.join(' -> ')}`,
      );
    }
  }
  lines.push('', formatAnalysisNote(result));
  return lines.join('\n');
}
