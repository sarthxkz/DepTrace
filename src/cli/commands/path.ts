import type { Command } from 'commander';
import { shortestPath } from '../../analysis/graph.js';
import { JSON_SCHEMA_VERSION } from '../../analysis/json.js';
import type { GraphEdge } from '../../analysis/types.js';
import { logger } from '../../utils/logger.js';
import {
  formatOption,
  loadAnalysis,
  printJson,
  rootOption,
  type OutputFormat,
} from '../options.js';
import { formatEdge } from '../output.js';

interface PathOptions {
  root: string;
  format: OutputFormat;
}

export function registerPathCommand(program: Command): void {
  program
    .command('path')
    .description('Show a shortest import path from one file to another')
    .argument('<from>', 'source file, relative to the current directory or absolute')
    .argument('<to>', 'target file, relative to the current directory or absolute')
    .addOption(rootOption())
    .addOption(formatOption())
    .addHelpText(
      'after',
      '\nFollows import edges in their direction (from importer to imported file).\nExits with code 0 whether or not a path exists.',
    )
    .action(async (fromArg: string, toArg: string, options: PathOptions) => {
      const { runAnalysis, resolveNodeArgument } = await loadAnalysis();
      const { result } = await runAnalysis(options.root);
      const { graph } = result;
      const from = resolveNodeArgument(result, fromArg);
      const to = resolveNodeArgument(result, toArg);
      const indices = shortestPath(
        graph,
        graph.indexOf.get(from) as number,
        graph.indexOf.get(to) as number,
      );
      const steps: GraphEdge[] = (indices ?? [])
        .slice(1)
        .map((node, i) => graph.edgeBetween(indices?.[i] as number, node) as GraphEdge);
      const path = indices?.map((node) => graph.nodes[node]?.id ?? '') ?? null;

      if (options.format === 'json') {
        printJson({ schemaVersion: JSON_SCHEMA_VERSION, from, to, path, steps });
      } else if (!path) {
        logger.info(`No dependency path from ${from} to ${to}.`);
      } else {
        logger.info(
          [
            `Dependency path from ${from} to ${to} (${String(steps.length)} step${steps.length === 1 ? '' : 's'}):`,
            `  ${from}`,
            ...steps.map((edge) => formatEdge(`-> ${edge.to}`, edge)),
          ].join('\n'),
        );
      }
    });
}
