import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { DEFAULT_BASELINE_FILENAME } from '../../baseline/baseline.js';
import { resolveTargetDirectory } from '../../config/paths.js';
import { CLI_NAME, ExitCode } from '../../core/constants.js';
import { DepTraceError } from '../../core/errors.js';
import { logger } from '../../utils/logger.js';
import { loadAnalysis } from '../options.js';

interface BaselineOptions {
  file?: string;
}

const count = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

export function registerBaselineCommand(program: Command): void {
  const baseline = program
    .command('baseline')
    .description('Record the current violations, so "check --baseline" fails only on new ones');

  for (const mode of ['create', 'update'] as const) {
    baseline
      .command(mode)
      .description(
        mode === 'create'
          ? 'Write a baseline of the current violations (never overwrites a file)'
          : 'Replace an existing baseline with the current violations',
      )
      .argument('[directory]', 'repository root', '.')
      .option('--file <path>', `baseline file (default: <directory>/${DEFAULT_BASELINE_FILENAME})`)
      .action(async (directory: string, options: BaselineOptions) => {
        const file =
          options.file === undefined
            ? path.join(resolveTargetDirectory(directory, process.cwd()), DEFAULT_BASELINE_FILENAME)
            : path.resolve(process.cwd(), options.file);
        const shown = path.relative(process.cwd(), file) || file;

        // Fail before the analysis; the write itself is still race-free.
        if (mode === 'create' && existsSync(file)) {
          throw new DepTraceError(
            `A baseline already exists at ${shown}. It was not modified. Replace it explicitly with "${CLI_NAME} baseline update".`,
            ExitCode.OperationalError,
          );
        }
        if (mode === 'update' && !existsSync(file)) {
          throw new DepTraceError(
            `No baseline to update at ${shown}. Create one with "${CLI_NAME} baseline create".`,
            ExitCode.UsageError,
          );
        }

        const cli = await loadAnalysis();
        let previous: Set<string> | undefined;
        let previousProblem: string | undefined;
        if (mode === 'update') {
          try {
            const old = await cli.readBaselineFile(file);
            previous = new Set(old.violations.map((entry) => entry.fingerprint));
          } catch (error) {
            if (!(error instanceof DepTraceError)) throw error;
            previousProblem = error.message;
          }
        }

        const { result, policy, evaluation, config } = await cli.runPolicy(directory);
        const next = cli.createBaseline(
          evaluation,
          cli.configurationOf(policy, config.analysis),
          program.version() ?? '',
        );
        await cli.writeBaselineFile(file, next, mode);

        const total = `${count(next.violations.length, 'accepted violation')} (${count(evaluation.errors, 'error')}, ${count(evaluation.warnings, 'warning')})`;
        if (mode === 'create') {
          logger.info(`Created ${shown} with ${total}.`);
          logger.info(
            `Review it and commit it. "${CLI_NAME} check --baseline ${shown}" then fails only on violations not in it.`,
          );
        } else {
          if (previous) {
            const added = next.violations.filter(
              (entry) => !previous.has(entry.fingerprint),
            ).length;
            const kept = next.violations.length - added;
            logger.info(
              `Updated ${shown}: ${total}; ${String(added)} added, ${String(previous.size - kept)} removed, ${String(kept)} unchanged.`,
            );
          } else {
            logger.info(`Replaced ${shown} with ${total}.`);
            logger.info(`The previous baseline could not be used: ${previousProblem ?? ''}`);
          }
          logger.info('Review the diff before committing: every added entry accepts a violation.');
        }
        logger.info(cli.formatAnalysisNote(result));
      });
  }
}
