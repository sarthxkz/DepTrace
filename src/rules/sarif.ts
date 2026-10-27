import { PRODUCT_NAME } from '../core/constants.js';
import { FINGERPRINT_VERSION } from './fingerprint.js';
import type { PolicyEvaluation, Violation } from './types.js';

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export interface SarifOptions {
  /** Prepended to root-relative paths so URIs are relative to the repository root ('' or 'dir/'). */
  pathPrefix: string;
  /** Fingerprints of violations that are new relative to a baseline; omit without a baseline. */
  newFingerprints?: ReadonlySet<string>;
}

/** Repository-relative path → relative URI reference (each segment percent-encoded). */
const toUri = (file: string) => file.split('/').map(encodeURIComponent).join('/');

/**
 * SARIF 2.1.0 log for code scanning tools such as GitHub code scanning.
 * Deterministic: no timestamps, no absolute paths.
 */
export function toSarif(evaluation: PolicyEvaluation, toolVersion: string, options: SarifOptions) {
  const rules = evaluation.rules.filter((rule) => rule.severity !== 'off');
  const ruleIndex = new Map(rules.map((rule, index) => [rule.id, index]));
  const location = (file: string) => ({
    artifactLocation: { uri: toUri(`${options.pathPrefix}${file}`) },
  });

  const result = (violation: Violation) => ({
    ruleId: violation.ruleId,
    ruleIndex: ruleIndex.get(violation.ruleId),
    level: violation.severity,
    message: { text: violation.message },
    locations: [
      {
        physicalLocation: {
          ...location(violation.file),
          ...(violation.line !== null && {
            region: { startLine: violation.line, startColumn: violation.column ?? 1 },
          }),
        },
      },
    ],
    ...(violation.target.kind === 'file' && {
      relatedLocations: [
        {
          id: 0,
          physicalLocation: location(violation.target.path),
          message: { text: 'Imported file' },
        },
      ],
    }),
    partialFingerprints: { [`deptrace/v${String(FINGERPRINT_VERSION)}`]: violation.fingerprint },
    ...(options.newFingerprints && {
      baselineState: options.newFingerprints.has(violation.fingerprint) ? 'new' : 'unchanged',
    }),
  });

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: PRODUCT_NAME,
            version: toolVersion,
            rules: rules.map((rule) => ({
              id: rule.id,
              shortDescription: { text: rule.description },
              defaultConfiguration: { level: rule.severity },
              properties: { tags: ['architecture', rule.type] },
            })),
          },
        },
        // TypeScript reports columns in UTF-16 code units.
        columnKind: 'utf16CodeUnits',
        results: evaluation.violations.map(result),
      },
    ],
  };
}
