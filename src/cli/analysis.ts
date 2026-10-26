import { existsSync } from 'node:fs';
import path from 'node:path';
import { analyzeRepository } from '../analysis/analyze.js';
import { DEFAULT_INCLUDE } from '../analysis/discovery.js';
import { realPath, toRelative } from '../analysis/paths.js';
import type { AnalysisResult } from '../analysis/types.js';
import { loadConfig } from '../config/load.js';
import type { DepTraceConfig } from '../config/schema.js';
import { resolveTargetDirectory } from '../config/paths.js';
import { CONFIG_FILENAME, ExitCode } from '../core/constants.js';
import { DepTraceError } from '../core/errors.js';
import { inspectRepository, type RepositoryInfo } from '../core/inspect.js';
import { parsePolicy } from '../rules/config.js';
import { evaluatePolicy } from '../rules/evaluate.js';
import type { Policy, PolicyEvaluation } from '../rules/types.js';

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
export { checkOutcome, toArchitectureSection, toCheckDocument } from '../rules/json.js';
export { formatCheck, formatReport } from './policy-output.js';
