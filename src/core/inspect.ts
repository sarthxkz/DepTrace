import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ExitCode } from './constants.js';
import { DepTraceError, fromFsError } from './errors.js';

export interface PackageInfo {
  name: string | undefined;
  version: string | undefined;
}

export interface RepositoryInfo {
  path: string;
  /** `undefined` when there is no package.json; `'invalid'` when it cannot be read or parsed. */
  packageJson: PackageInfo | 'invalid' | undefined;
  hasTsconfig: boolean;
  /** Nearest directory (the target or an ancestor) containing `.git`. */
  gitRoot: string | undefined;
}

/**
 * Lightweight inspection of a single directory. Reads only the directory
 * listing and package.json; never recurses into subdirectories.
 */
export async function inspectRepository(directory: string): Promise<RepositoryInfo> {
  await assertDirectory(directory);

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw fromFsError(error, directory, 'Reading the directory');
  }
  const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

  return {
    path: directory,
    packageJson: files.has('package.json')
      ? await readPackageInfo(path.join(directory, 'package.json'))
      : undefined,
    hasTsconfig: files.has('tsconfig.json'),
    gitRoot: await findGitRoot(directory),
  };
}

async function assertDirectory(directory: string): Promise<void> {
  try {
    if (!(await stat(directory)).isDirectory()) {
      throw new DepTraceError(`Not a directory: ${directory}`, ExitCode.UsageError);
    }
  } catch (error) {
    if (error instanceof DepTraceError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new DepTraceError(`Directory not found: ${directory}`, ExitCode.UsageError, {
        cause: error,
      });
    }
    throw fromFsError(error, directory, 'Accessing the directory');
  }
}

async function readPackageInfo(file: string): Promise<PackageInfo | 'invalid'> {
  try {
    const data: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (typeof data !== 'object' || data === null) return 'invalid';
    const { name, version } = data as Record<string, unknown>;
    return {
      name: typeof name === 'string' ? name : undefined,
      version: typeof version === 'string' ? version : undefined,
    };
  } catch {
    return 'invalid';
  }
}

/** Walks up from `directory` looking for `.git` (a directory, or a file for worktrees/submodules). */
async function findGitRoot(directory: string): Promise<string | undefined> {
  for (let current = directory; ;) {
    try {
      await stat(path.join(current, '.git'));
      return current;
    } catch {
      // Not here (or unreadable); keep walking up.
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
