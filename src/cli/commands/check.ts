import type { Command } from 'commander';
import { CONFIG_FILENAME, ExitCode } from '../../core/constants.js';
import { DepTraceError } from '../../core/errors.js';
import { logger } from '../../utils/logger.js';
import { formatOption, loadAnalysis, printJson, type OutputFormat } from '../options.js';

interface CheckOptions {
  format: OutputFormat;
  strict?: true;
  verbose?: true;
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Evaluate the architecture rules in deptrace.yml')
    .argument('[directory]', 'repository root to check', '.')
    .addOption(formatOption())
    .option('--strict', 'fail on warning violations too')
    .option('--verbose', 'show violation fingerprints')
    .addHelpText(
      'after',
      `
Exit codes: 0 no failing violations, 3 violations (errors; with --strict also
warnings), 2 missing or invalid ${CONFIG_FILENAME} or no rules configured.
Unresolved imports and cycles are not violations unless a rule says so.`,
    )
    .action(async (directory: string, options: CheckOptions) => {
      const { runAnalysis, evaluateConfiguredPolicy, checkOutcome, toCheckDocument, formatCheck } =
        await loadAnalysis();
      const { result, config } = await runAnalysis(directory);
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

      const strict = options.strict === true;
      if (options.format === 'json') {
        printJson(toCheckDocument(result, evaluation, strict, program.version() ?? ''));
      } else {
        logger.info(formatCheck(result, evaluation, options.verbose === true));
      }

      const failing = evaluation.errors + (strict ? evaluation.warnings : 0);
      if (checkOutcome(evaluation, strict) === 'failed') {
        throw new DepTraceError(
          `Architecture check failed: ${String(failing)} failing violation${failing === 1 ? '' : 's'}${strict ? ' (strict mode: warnings fail too)' : ''}.`,
          ExitCode.ArchitectureViolations,
        );
      }
      if (options.format !== 'json') {
        logger.info(
          `\nArchitecture check passed${evaluation.warnings > 0 ? ` with ${String(evaluation.warnings)} warning(s)` : ''}.`,
        );
      }
    });
}
