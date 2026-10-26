import type { Command } from 'commander';
import { PRODUCT_NAME } from '../../core/constants.js';
import { notImplemented } from '../../core/errors.js';

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Check architecture rules (not implemented yet; exits with code 4)')
    .action(() => {
      throw notImplemented(
        `Architecture checking is not implemented in ${PRODUCT_NAME} Phase 1. No checks were run.`,
      );
    });
}
