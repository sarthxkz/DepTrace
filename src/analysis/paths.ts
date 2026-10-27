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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Removes machine-specific absolute paths from a message (e.g. a TypeScript or
 * filesystem error): paths under `root` become repository-relative and the
 * home directory becomes "~". Reports and CI artifacts then never reveal the
 * checkout location or the user name.
 */
export function redactPaths(message: string, root: string, home: string): string {
  const flags = process.platform === 'win32' ? 'gi' : 'g';
  let result = message;
  for (const [base, replacement] of [
    [root, ''],
    [home, '~'],
  ] as const) {
    // Skip empty and filesystem-root bases: replacing "/" would mangle every path.
    if (base.length < 2 || path.parse(base).root === base) continue;
    for (const variant of new Set([base, base.replace(/\\/g, '/'), base.replace(/\//g, '\\')])) {
      const pattern = escapeRegExp(variant);
      // A base followed by a separator is a prefix; alone (not part of a longer name) it is the base itself.
      result =
        replacement === ''
          ? result
              .replace(new RegExp(`${pattern}[\\\\/]`, flags), '')
              .replace(new RegExp(`${pattern}(?![\\w.-])`, flags), '.')
          : result.replace(new RegExp(`${pattern}(?![\\w.-])`, flags), replacement);
    }
  }
  return result;
}
