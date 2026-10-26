import type { Command } from 'commander';
import { resolveTargetDirectory } from '../../config/paths.js';
import { PHASE_STATUS, PRODUCT_NAME } from '../../core/constants.js';
import { inspectRepository, type RepositoryInfo } from '../../core/inspect.js';
import { logger } from '../../utils/logger.js';

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Inspect a repository directory (basic metadata only)')
    .argument('[directory]', 'directory to inspect', '.')
    .action(async (directory: string) => {
      const info = await inspectRepository(resolveTargetDirectory(directory, process.cwd()));
      logger.info(formatRepositoryInfo(info));
    });
}

function formatPackage(info: RepositoryInfo['packageJson']): string {
  if (info === undefined) return 'not found';
  if (info === 'invalid') return 'found, but could not be read as JSON';
  return `${info.name ?? '(unnamed)'}${info.version ? `@${info.version}` : ''}`;
}

function formatRepositoryInfo(info: RepositoryInfo): string {
  return [
    `${PRODUCT_NAME} repository inspection`,
    '',
    `  Directory:      ${info.path}`,
    `  package.json:   ${formatPackage(info.packageJson)}`,
    `  tsconfig.json:  ${info.hasTsconfig ? 'found' : 'not found'}`,
    `  Git repository: ${info.gitRoot ? `yes (root: ${info.gitRoot})` : 'not detected'}`,
    `  Status:         ${PHASE_STATUS}`,
    '',
    'Repository inspection completed. Dependency analysis is not available in this version.',
  ].join('\n');
}
