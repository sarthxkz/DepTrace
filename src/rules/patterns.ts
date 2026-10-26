import picomatch from 'picomatch';

/** Why a glob is unsafe or unsupported, or null when it is fine. */
export function patternProblem(pattern: string): string | null {
  if (pattern.length === 0) return 'must not be empty';
  if (
    pattern.startsWith('/') ||
    /^[a-zA-Z]:/.test(pattern) ||
    pattern.split(/[\\/]/).includes('..')
  ) {
    return 'must be relative to the repository root (no leading "/", drive letter or ".." segment)';
  }
  if (pattern.includes('\\')) return 'must use forward slashes ("src/**", not "src\\**")';
  return null;
}

export type Matcher = (path: string) => boolean;

/** Compiles globs matched against root-relative, forward-slash paths. Empty → matches nothing. */
export function compileMatcher(patterns: readonly string[]): Matcher {
  if (patterns.length === 0) return () => false;
  return picomatch([...patterns], { dot: true });
}
