import path from 'node:path';
import { CONFIG_FILENAME } from '../core/constants.js';

/** Resolves a user-supplied directory (default ".") against the working directory. */
export function resolveTargetDirectory(input: string | undefined, cwd: string): string {
  return path.resolve(cwd, input ?? '.');
}

export function configPath(directory: string): string {
  return path.join(directory, CONFIG_FILENAME);
}
