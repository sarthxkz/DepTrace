import type { Command } from 'commander';
import { writeStarterConfig } from '../../config/init.js';
import { CONFIG_FILENAME } from '../../core/constants.js';
import { logger } from '../../utils/logger.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description(`Create a starter ${CONFIG_FILENAME} in the current directory`)
    .addHelpText(
      'after',
      `\nAn existing ${CONFIG_FILENAME} is never overwritten; the command exits with code 1 instead.`,
    )
    .action(async () => {
      const file = await writeStarterConfig(process.cwd());
      logger.info(`Created ${file}`);
      logger.info(
        'Note: architecture rules are not implemented yet. This file is a starting point for future versions.',
      );
    });
}
