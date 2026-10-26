import { realpathSync } from 'node:fs';
import path from 'node:path';

/** Converts platform separators to forward slashes. */
export function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

/**
 * Returns `file` relative to `root` with forward slashes, '' for the root
 * itself, or null when `file` is outside `root`.
 */
export function toRelative(root: string, file: string): string | null {
  const relative = path.relative(root, file);
  if (relative === '') return '';
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return toPosix(relative);
}

/** Resolves symlinks and, on case-insensitive systems, the real letter case. */
export function realPath(file: string): string {
  try {
    return realpathSync.native(file);
  } catch {
    return path.resolve(file);
  }
}
