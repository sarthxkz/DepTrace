import type { Command } from 'commander';
import { repositoryMetadata, toJsonDocument } from '../../analysis/json.js';
import { formatOption, loadAnalysis, printJson, type OutputFormat } from '../options.js';
import { formatScan } from '../output.js';
import { logger } from '../../utils/logger.js';

interface ScanOptions {
  format: OutputFormat;
  verbose?: true;
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Analyze source dependencies and detect circular imports')
    .argument('[directory]', 'repository root to analyze', '.')
    .addOption(formatOption())
    .option('--verbose', 'list every cycle, diagnostic, external package and edge location')
    .addHelpText(
      'after',
      `
The scan reports findings; it does not fail on them. Exit code 0 means the
analysis completed (check "status" for diagnostics), even when cycles exist.`,
    )
    .action(async (directory: string, options: ScanOptions) => {
      const { runAnalysis } = await loadAnalysis();
      const { info, result } = await runAnalysis(directory);
      if (options.format === 'json') {
        printJson(toJsonDocument(result, program.version() ?? '', repositoryMetadata(info)));
      } else {
        logger.info(formatScan(info, result, options.verbose === true));
      }
    });
}
