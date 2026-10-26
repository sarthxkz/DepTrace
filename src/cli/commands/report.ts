import type { Command } from 'commander';
import { repositoryMetadata, toJsonDocument } from '../../analysis/json.js';
import { logger } from '../../utils/logger.js';
import { formatOption, loadAnalysis, printJson, type OutputFormat } from '../options.js';

interface ReportOptions {
  format: OutputFormat;
  verbose?: true;
}

export function registerReportCommand(program: Command): void {
  program
    .command('report')
    .description('Architecture report: layers, layer dependencies, rule results and cycles')
    .argument('[directory]', 'repository root to report on', '.')
    .addOption(formatOption())
    .option('--verbose', 'list the files of every layer and violation fingerprints')
    .addHelpText(
      'after',
      '\nThe report is informational and exits with code 0 even when rules are violated;\nuse "deptrace check" to enforce rules.',
    )
    .action(async (directory: string, options: ReportOptions) => {
      const { runAnalysis, evaluateConfiguredPolicy, toArchitectureSection, formatReport } =
        await loadAnalysis();
      const { info, result, config } = await runAnalysis(directory);
      const { policy, evaluation } = evaluateConfiguredPolicy(result, config);
      if (options.format === 'json') {
        printJson({
          ...toJsonDocument(result, program.version() ?? '', repositoryMetadata(info)),
          architecture: toArchitectureSection(result, policy, evaluation),
        });
      } else {
        logger.info(formatReport(result, policy, evaluation, options.verbose === true));
      }
    });
}
