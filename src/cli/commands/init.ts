import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { detectLayers, renderDetectedConfig } from '../../config/detect.js';
import { configExistsError, writeStarterConfig } from '../../config/init.js';
import { configPath } from '../../config/paths.js';
import { CONFIG_FILENAME } from '../../core/constants.js';
import { logger } from '../../utils/logger.js';
import { loadAnalysis } from '../options.js';

interface InitOptions {
  detect?: true;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description(`Create a starter ${CONFIG_FILENAME} in the current directory`)
    .option(
      '--detect',
      'suggest layers and allowed imports from the folders and imports found today',
    )
    .addHelpText(
      'after',
      `
An existing ${CONFIG_FILENAME} is never overwritten; the command exits with code 1 instead.

With --detect, each folder in src/ (or each top-level folder) becomes a layer, and
every import between layers that exists today is allowed. Review the allowed list:
it includes any existing violation.`,
    )
    .action(async (options: InitOptions) => {
      const directory = process.cwd();
      if (options.detect !== true) {
        logger.info(`Created ${await writeStarterConfig(directory)}`);
        logger.info(
          'Add layers and rules to it (see the commented example), then run "deptrace check".',
        );
        return;
      }

      // Checked first: the analysis would otherwise load the existing file.
      if (existsSync(configPath(directory))) throw configExistsError(configPath(directory));
      const { runAnalysis } = await loadAnalysis();
      const { result } = await runAnalysis(directory);
      const detection = detectLayers(
        result.graph.nodes.map((node) => node.id),
        result.graph.edges,
      );
      if (detection === null) {
        logger.info(`Created ${await writeStarterConfig(directory)}`);
        logger.info(
          'No layers detected: fewer than two folders with source files in src/ or at the top level. Add layers by hand (see the commented example).',
        );
        return;
      }
      const file = await writeStarterConfig(directory, (name) =>
        renderDetectedConfig(name, detection),
      );
      const where = detection.base === '' ? 'top-level folders' : `folders in ${detection.base}/`;
      logger.info(`Created ${file}`);
      logger.info(
        `Detected ${String(detection.layers.length)} layers from ${where}: ${detection.layers.map((layer) => layer.name).join(', ')}`,
      );
      for (const [a, b] of detection.mutual) {
        logger.info(`Note: ${a} and ${b} import each other.`);
      }
      logger.info(
        `Review the allowed imports in ${path.basename(file)}: they include every import that exists today, violations too. Then run "deptrace check".`,
      );
    });
}
