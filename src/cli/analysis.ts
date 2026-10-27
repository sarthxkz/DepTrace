import { existsSync } from 'node:fs';
import path from 'node:path';
import { analyzeRepository } from '../analysis/analyze.js';
import { repositoryMetadata, toJsonDocument } from '../analysis/json.js';
import { DEFAULT_INCLUDE } from '../analysis/discovery.js';
import { realPath, toRelative } from '../analysis/paths.js';
import type { AnalysisResult } from '../analysis/types.js';
import {
  compareWithBaseline,
  compatibilityProblems,
  configurationOf,
  type Baseline,
} from '../baseline/baseline.js';
import { toBaselineArchitectureSection } from '../baseline/report.js';
import { loadConfig } from '../config/load.js';
import type { DepTraceConfig } from '../config/schema.js';
import { resolveTargetDirectory } from '../config/paths.js';
import { CLI_NAME, CONFIG_FILENAME, ExitCode } from '../core/constants.js';
import { DepTraceError } from '../core/errors.js';
import { inspectRepository, type RepositoryInfo } from '../core/inspect.js';
import { parsePolicy } from '../rules/config.js';
import { evaluatePolicy } from '../rules/evaluate.js';
import { toArchitectureSection } from '../rules/json.js';
import type { Policy, PolicyEvaluation } from '../rules/types.js';
import type { BaselineView } from './policy-output.js';

export interface AnalysisRun {
  info: RepositoryInfo;
  /** The parsed deptrace.yml, or undefined when there is none. */
  config: DepTraceConfig | undefined;
  result: AnalysisResult;
}

/** Validates the directory, loads deptrace.yml if present and runs the analysis. */
export async function runAnalysis(directory: string): Promise<AnalysisRun> {
  const target = resolveTargetDirectory(directory, process.cwd());
  const info = await inspectRepository(target);
  const config = await loadConfig(target);
  const showProgress = process.stderr.isTTY;
  const result = await analyzeRepository(realPath(target), {
    include: config?.analysis.include ?? DEFAULT_INCLUDE,
    exclude: config?.analysis.exclude ?? [],
    configFile: config ? CONFIG_FILENAME : null,
    // Progress goes to stderr only, so stdout (e.g. JSON) stays clean.
    ...(showProgress && {
      onProgress: (processed: number, total: number) => {
        process.stderr.write(
          processed < total
            ? `\rAnalyzing ${String(processed)}/${String(total)} files...`
            : '\r\x1b[K',
        );
      },
    }),
  });
  return { info, result, config };
}

/**
 * Maps a file argument (relative to the current directory, or absolute) to a
 * graph node id. Throws a usage error when it is not an analyzed source file.
 */
export function resolveNodeArgument(result: AnalysisResult, file: string): string {
  const absolute = path.resolve(process.cwd(), file);
  if (!existsSync(absolute)) {
    throw new DepTraceError(`File not found: ${absolute}`, ExitCode.UsageError);
  }
  const id = toRelative(result.root, realPath(absolute));
  if (id === null || id === '') {
    throw new DepTraceError(
      `${absolute} is outside the analyzed root ${result.root}. Use --root to choose another root.`,
      ExitCode.UsageError,
    );
  }
  if (!result.graph.indexOf.has(id)) {
    throw new DepTraceError(
      `${id} is not an analyzed source file (unsupported extension, or excluded by ${CONFIG_FILENAME} or the built-in excludes).`,
      ExitCode.UsageError,
    );
  }
  return id;
}

export interface PolicyRun extends AnalysisRun {
  config: DepTraceConfig;
  policy: Policy;
  evaluation: PolicyEvaluation;
}

/**
 * Runs the analysis and evaluates the configured rules. Throws a usage error
 * when there is no deptrace.yml or no rule, so a check can never pass with
 * nothing to check.
 */
export async function runPolicy(directory: string): Promise<PolicyRun> {
  const run = await runAnalysis(directory);
  const { config, result } = run;
  if (!config) {
    throw new DepTraceError(
      `No ${CONFIG_FILENAME} found in ${result.root}. Run "deptrace init" and add rules (see docs/rules.md).`,
      ExitCode.UsageError,
    );
  }
  const { policy, evaluation } = evaluateConfiguredPolicy(result, config);
  if (policy.rules.length === 0) {
    throw new DepTraceError(
      `No architecture rules are configured in ${CONFIG_FILENAME}, so there is nothing to check. Add rules (see docs/rules.md).`,
      ExitCode.UsageError,
    );
  }
  return { ...run, config, policy, evaluation };
}

/**
 * Prefix that turns root-relative paths into paths relative to the Git
 * repository root ('' or 'dir/'), as GitHub annotations and SARIF expect.
 */
export function repositoryPathPrefix(run: AnalysisRun): string {
  if (!run.info.gitRoot) return '';
  const relative = toRelative(realPath(run.info.gitRoot), run.result.root);
  return relative ? `${relative}/` : '';
}

/**
 * Compares the current violations with an approved baseline. Throws a usage
 * error when the baseline was approved under other rules: an incompatible
 * baseline is never treated as empty.
 */
export function compareBaseline(run: PolicyRun, file: string, approved: Baseline): BaselineView {
  const problems = compatibilityProblems(
    approved,
    configurationOf(run.policy, run.config.analysis),
  );
  if (problems.length > 0) {
    throw new DepTraceError(
      `The baseline ${file} does not match the current configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n` +
        `A baseline is only valid for the rules it was approved under. Review the change, run "${CLI_NAME} baseline update" and commit the result.`,
      ExitCode.UsageError,
    );
  }
  return {
    // Never an absolute path in reports: relative to the root, or just the name.
    file: toRelative(run.result.root, realPath(file)) || path.basename(file),
    comparison: compareWithBaseline(approved, run.evaluation.violations),
  };
}

/** The `deptrace report --format json` document (the dashboard's input). */
export function toReportDocument(
  run: AnalysisRun,
  policyResult: { policy: Policy; evaluation: PolicyEvaluation },
  toolVersion: string,
  baseline?: BaselineView,
) {
  const section = toArchitectureSection(run.result, policyResult.policy, policyResult.evaluation);
  return {
    ...toJsonDocument(run.result, toolVersion, repositoryMetadata(run.info)),
    architecture: baseline
      ? toBaselineArchitectureSection(section, baseline.comparison, baseline.file)
      : section,
  };
}

/** Evaluates the rules of `config` (none when there is no config). */
export function evaluateConfiguredPolicy(
  result: AnalysisResult,
  config: DepTraceConfig | undefined,
): { policy: Policy; evaluation: PolicyEvaluation } {
  // loadConfig already validated the config, so parsing cannot report problems here.
  const policy = config
    ? parsePolicy(config.layers, config.rules).policy
    : { layers: [], rules: [] };
  return { policy, evaluation: evaluatePolicy(result, policy) };
}

// Heavy (TypeScript-dependent) helpers, re-exported so commands load them through loadAnalysis().
export {
  checkOutcome,
  failingViolations,
  toArchitectureSection,
  toCheckDocument,
} from '../rules/json.js';
export { toSarif } from '../rules/sarif.js';
export {
  compareWithBaseline,
  compatibilityProblems,
  configurationOf,
  createBaseline,
} from '../baseline/baseline.js';
export { readBaselineFile, writeBaselineFile } from '../baseline/file.js';
export { toBaselineCheckDocument } from '../baseline/report.js';
export { formatAnalysisNote, formatCheck, formatReport } from './policy-output.js';
export { formatAnnotations, formatSummary } from './github.js';
