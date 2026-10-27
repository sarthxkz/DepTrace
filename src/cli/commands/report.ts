import path from 'node:path';
import type { Command } from 'commander';
import { logger } from '../../utils/logger.js';
import { formatOption, loadAnalysis, printJson, type OutputFormat } from '../options.js';

interface ReportOptions {
  format: OutputFormat;
  verbose?: true;
  baseline?: string;
}

export function registerReportCommand(program: Command): void {
  program
    .command('report')
    .description('Architecture report: layers, layer dependencies, rule results and cycles')
    .argument('[directory]', 'repository root to report on', '.')
    .addOption(formatOption())
    .option('--verbose', 'list the files of every layer and violation fingerprints')
    .option('--baseline <file>', 'mark each violation as new or accepted by this baseline')
    .addHelpText(
      'after',
      '\nThe report is informational and exits with code 0 even when rules are violated;\nuse "deptrace check" to enforce rules. "deptrace dashboard" shows the JSON report\nin the browser.',
    )
    .action(async (directory: string, options: ReportOptions) => {
      const cli = await loadAnalysis();
      const baselineFile =
        options.baseline === undefined ? undefined : path.resolve(process.cwd(), options.baseline);
      // A baseline needs rules to compare against, so it requires deptrace.yml and rules.
      const approved = baselineFile ? await cli.readBaselineFile(baselineFile) : undefined;
      if (baselineFile && approved) {
        const run = await cli.runPolicy(directory);
        const baseline = cli.compareBaseline(run, baselineFile, approved);
        output(run, run, baseline);
        return;
      }
      const run = await cli.runAnalysis(directory);
      output(run, cli.evaluateConfiguredPolicy(run.result, run.config));

      function output(
        analysis: typeof run,
        policyResult: ReturnType<typeof cli.evaluateConfiguredPolicy>,
        baseline?: ReturnType<typeof cli.compareBaseline>,
      ): void {
        if (options.format === 'json') {
          printJson(
            cli.toReportDocument(analysis, policyResult, program.version() ?? '', baseline),
          );
        } else {
          logger.info(
            cli.formatReport(
              analysis.result,
              policyResult.policy,
              policyResult.evaluation,
              options.verbose === true,
              baseline,
            ),
          );
        }
      }
    });
}
