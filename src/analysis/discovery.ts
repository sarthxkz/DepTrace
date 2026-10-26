import type { Dirent } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import type { AnalysisDiagnostic, DiscoveryStats } from './types.js';

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

/** Directory names skipped at any depth, whatever the configuration says. */
export const BUILTIN_EXCLUDED_DIRECTORIES = [
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
];

/** File patterns skipped by default (generated/minified output). */
export const BUILTIN_EXCLUDED_FILES = ['**/*.min.js'];

export const DEFAULT_INCLUDE = ['**/*'];

export interface DiscoveryOptions {
  /** Glob patterns relative to the root (forward slashes). */
  include: string[];
  exclude: string[];
}

export interface DiscoveryResult {
  /** Repository-relative paths, sorted by code unit order. */
  files: string[];
  stats: DiscoveryStats;
  diagnostics: AnalysisDiagnostic[];
}

export function isSourceFile(fileName: string): boolean {
  return SOURCE_EXTENSIONS.includes(path.extname(fileName));
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Walks `root` without following symbolic links and returns the supported
 * source files matching `include` and not matching `exclude`.
 */
export function discoverSourceFiles(root: string, options: DiscoveryOptions): DiscoveryResult {
  const isIncluded = picomatch(options.include);
  const isExcluded = picomatch([...options.exclude, ...BUILTIN_EXCLUDED_FILES], { dot: true });
  const excludedNames = new Set(BUILTIN_EXCLUDED_DIRECTORIES);
  const stats: DiscoveryStats = {
    filesDiscovered: 0,
    directoriesExcluded: 0,
    filesExcluded: 0,
    symlinksSkipped: 0,
    unreadableDirectories: 0,
  };
  const diagnostics: AnalysisDiagnostic[] = [];
  const files: string[] = [];

  // Iterative walk: deep trees cannot overflow the call stack.
  const pending = [''];
  while (pending.length > 0) {
    const relDir = pending.pop() ?? '';
    let entries: Dirent[];
    try {
      entries = readdirSync(path.join(root, relDir), { withFileTypes: true });
    } catch (error) {
      stats.unreadableDirectories++;
      diagnostics.push({
        severity: 'warning',
        code: 'discovery-error',
        message: `Directory could not be read and was skipped: ${(error as Error).message}`,
        file: relDir || '.',
        line: null,
        column: null,
      });
      continue;
    }
    const subdirectories: string[] = [];
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        stats.symlinksSkipped++;
      } else if (entry.isDirectory()) {
        if (excludedNames.has(entry.name) || isExcluded(rel)) stats.directoriesExcluded++;
        else subdirectories.push(rel);
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        if (isIncluded(rel) && !isExcluded(rel)) files.push(rel);
        else stats.filesExcluded++;
      }
    }
    // Push in reverse so directories are visited in ascending order.
    pending.push(...subdirectories.sort(compareStrings).reverse());
  }

  files.sort(compareStrings);
  stats.filesDiscovered = files.length;
  return { files, stats, diagnostics };
}
