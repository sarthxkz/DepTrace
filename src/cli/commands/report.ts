import type { Command } from 'commander';
import { PRODUCT_NAME } from '../../core/constants.js';
import { notImplemented } from '../../core/errors.js';

export function registerReportCommand(program: Command): void {
  program
    .command('report')
    .description('Generate an architecture report (not implemented yet; exits with code 4)')
    .action(() => {
      throw notImplemented(
        `Report generation is not implemented in ${PRODUCT_NAME} Phase 1. No report was generated.`,
      );
    });
}
