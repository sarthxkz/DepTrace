import type { AnalysisResult } from '../analysis/types.js';
import { CLI_NAME, PRODUCT_NAME } from '../core/constants.js';
import type { PolicyEvaluation, Violation } from '../rules/types.js';
import type { BaselineView } from './policy-output.js';

/** GitHub shows at most 10 error and 10 warning annotations per step. */
export const MAX_ANNOTATIONS_PER_LEVEL = 10;
/** Rows per table in the Markdown summary; the JSON report has everything. */
export const SUMMARY_ROW_LIMIT = 30;
const MAX_FILES_LISTED = 10;
const MAX_CELL_LENGTH = 300;
const MAX_ANNOTATION_LENGTH = 1000;

const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// Workflow command escaping, as in @actions/core.
export const escapeData = (text: string) =>
  text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
export const escapeProperty = (text: string) =>
  escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

/**
 * GitHub workflow commands that annotate violations at their source location
 * (paths relative to the repository root via `pathPrefix`). Bounded per level.
 */
export function formatAnnotations(violations: Violation[], pathPrefix: string): string[] {
  const lines: string[] = [];
  const shown = { error: 0, warning: 0 };
  let skipped = 0;
  for (const violation of violations) {
    if (shown[violation.severity] >= MAX_ANNOTATIONS_PER_LEVEL) {
      skipped++;
      continue;
    }
    shown[violation.severity]++;
    const properties = [`file=${escapeProperty(`${pathPrefix}${violation.file}`)}`];
    if (violation.line !== null) {
      properties.push(`line=${String(violation.line)}`, `col=${String(violation.column ?? 1)}`);
    }
    properties.push(`title=${escapeProperty(`${PRODUCT_NAME} ${violation.ruleId}`)}`);
    lines.push(
      `::${violation.severity} ${properties.join(',')}::${escapeData(truncate(violation.message, MAX_ANNOTATION_LENGTH))}`,
    );
  }
  if (skipped > 0) {
    lines.push(
      `::notice title=${PRODUCT_NAME}::${String(skipped)} more violations are not annotated; see the job summary or the JSON report.`,
    );
  }
  return lines;
}

/**
 * Text that renders literally inside Markdown (tables included): every ASCII
 * punctuation character is backslash-escaped, so file names and messages
 * from the repository cannot inject links, HTML or table cells.
 */
export function markdownText(text: string, max = MAX_CELL_LENGTH): string {
  return truncate(text.replace(/\s+/g, ' '), max).replace(/[!-/:-@[-`{-~]/g, '\\$&');
}

const location = (violation: Violation) =>
  violation.line === null ? violation.file : `${violation.file}:${String(violation.line)}`;

function table(header: string[], rows: string[][], total: number, noun: string): string[] {
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => ' --- |').join('')}`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  if (total > rows.length) {
    lines.push(
      '',
      `_Showing ${String(rows.length)} of ${String(total)} ${noun}; the JSON report lists all._`,
    );
  }
  return lines;
}

export interface SummaryInput {
  result: AnalysisResult;
  evaluation: PolicyEvaluation;
  baseline: BaselineView | undefined;
  strict: boolean;
  failing: number;
  /** File name of the JSON report, when one was written. */
  reportFile: string | null;
}

/** Markdown job summary (for $GITHUB_STEP_SUMMARY). Bounded in size. */
export function formatSummary(input: SummaryInput): string {
  const { result, evaluation, baseline, strict, failing } = input;
  const comparison = baseline?.comparison;
  const failed = failing > 0;
  const count = (violations: Violation[], severity: 'error' | 'warning') =>
    String(violations.filter((violation) => violation.severity === severity).length);
  const row = (label: string, violations: Violation[]) => [
    label,
    count(violations, 'error'),
    count(violations, 'warning'),
    String(violations.length),
  ];

  const lines = [
    `## ${PRODUCT_NAME} architecture check: ${failed ? 'failed' : 'passed'}`,
    '',
    failed
      ? `**${String(failing)} failing violation${failing === 1 ? '' : 's'}**${comparison ? ' not in the baseline' : ''}${strict ? ' (strict mode: warnings fail too)' : ''}.`
      : `No failing violations${comparison ? ' outside the baseline' : ''}.`,
    '',
    comparison
      ? `Mode: baseline comparison against ${markdownText(baseline.file)}. Violations accepted by the baseline do not fail the check.`
      : 'Mode: full architecture check.',
    '',
    ...table(
      ['Violations', 'Errors', 'Warnings', 'Total'],
      [
        row('All current', evaluation.violations),
        ...(comparison
          ? [
              row('New', comparison.new),
              row('Existing (in baseline)', comparison.existing),
              ['Resolved (in baseline, gone)', '', '', String(comparison.resolved.length)],
            ]
          : []),
      ],
      0,
      '',
    ),
    '',
    '### Rules',
    '',
  ];

  const newByRule = new Map<string, number>();
  for (const violation of comparison?.new ?? []) {
    newByRule.set(violation.ruleId, (newByRule.get(violation.ruleId) ?? 0) + 1);
  }
  lines.push(
    ...table(
      ['Rule', 'Severity', 'Violations', ...(comparison ? ['New'] : [])],
      evaluation.rules.map((rule) => [
        markdownText(rule.id),
        rule.severity,
        rule.severity === 'off' ? 'not evaluated' : String(rule.violations),
        ...(comparison ? [String(newByRule.get(rule.id) ?? 0)] : []),
      ]),
      0,
      '',
    ),
    '',
  );

  const listed = comparison ? comparison.new : evaluation.violations;
  if (listed.length > 0) {
    lines.push(
      `### ${comparison ? 'New violations' : 'Violations'}`,
      '',
      ...table(
        ['Severity', 'Location', 'Rule', 'Message'],
        listed
          .slice(0, SUMMARY_ROW_LIMIT)
          .map((violation) => [
            violation.severity,
            markdownText(location(violation)),
            markdownText(violation.ruleId),
            markdownText(violation.message),
          ]),
        listed.length,
        'violations',
      ),
      '',
    );

    const perFile = new Map<string, number>();
    for (const violation of listed) {
      perFile.set(violation.file, (perFile.get(violation.file) ?? 0) + 1);
    }
    const files = [...perFile].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    lines.push(
      '### Most affected files',
      '',
      ...table(
        ['File', 'Violations'],
        files
          .slice(0, MAX_FILES_LISTED)
          .map(([file, total]) => [markdownText(file), String(total)]),
        files.length,
        'files',
      ),
      '',
    );
  }

  if (comparison && comparison.resolved.length > 0) {
    lines.push(
      '### Resolved baseline entries',
      '',
      ...table(
        ['File', 'Rule', 'Message'],
        comparison.resolved
          .slice(0, SUMMARY_ROW_LIMIT)
          .map((entry) => [
            markdownText(entry.file),
            markdownText(entry.ruleId),
            markdownText(entry.message),
          ]),
        comparison.resolved.length,
        'entries',
      ),
      '',
    );
  }

  const advice: string[] = [];
  if (failed && comparison) {
    advice.push(
      `Fix the new violations. If one is intentional, accept it with \`${CLI_NAME} baseline update\` and commit the baseline change for review.`,
    );
  } else if (failed) {
    advice.push(
      `Fix the violations above. To adopt ${PRODUCT_NAME} in a codebase with existing violations, record them with \`${CLI_NAME} baseline create\` and run \`${CLI_NAME} check --baseline\`.`,
    );
  }
  if (comparison && comparison.resolved.length > 0) {
    advice.push(
      `Run \`${CLI_NAME} baseline update\` to remove resolved entries, so the violations cannot come back unnoticed.`,
    );
  }
  if (!strict && evaluation.warnings > 0) {
    advice.push('Warnings do not fail the check; `--strict` makes them fail.');
  }
  if (result.status !== 'completed') {
    advice.push(
      `The analysis reported diagnostics (${plural(result.summary.errors, 'error')}, ${plural(result.summary.warnings, 'warning')}). Unresolved imports are not checked; run \`${CLI_NAME} scan\` for details.`,
    );
  }
  if (advice.length > 0) lines.push('### Next steps', '', ...advice.map((item) => `- ${item}`), '');

  lines.push(
    `Analysis: ${String(result.summary.nodes)} files, ${String(result.summary.edges)} dependencies${result.status === 'completed' ? '' : ', completed with diagnostics'}.` +
      (input.reportFile ? ` Full report: ${markdownText(input.reportFile)}.` : ''),
    '',
  );
  return lines.join('\n');
}
