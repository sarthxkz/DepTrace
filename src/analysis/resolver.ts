import { statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { isSourceFile } from './discovery.js';
import { realPath, toRelative } from './paths.js';
import type { ProjectConfig } from './project.js';
import type { ResolutionResult } from './types.js';

/** `lodash/fp` → `lodash`, `@scope/pkg/sub` → `@scope/pkg`. */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier === '.' ||
    specifier === '..' ||
    path.isAbsolute(specifier)
  );
}

function matchesPathAlias(specifier: string, paths: ts.MapLike<string[]> | undefined): boolean {
  return Object.keys(paths ?? {}).some((pattern) => {
    const star = pattern.indexOf('*');
    if (star === -1) return specifier === pattern;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    return (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    );
  });
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function memoize<T>(fn: (key: string) => T): (key: string) => T {
  const cache = new Map<string, T>();
  return (key) => {
    if (!cache.has(key)) cache.set(key, fn(key));
    return cache.get(key) as T;
  };
}

/**
 * ts.sys with memoized filesystem probes. Resolution checks the same candidate
 * paths from many importers; the files are assumed not to change during a scan.
 */
function createCachingHost(): ts.ModuleResolutionHost {
  return {
    fileExists: memoize((file) => ts.sys.fileExists(file)),
    directoryExists: memoize((directory) => ts.sys.directoryExists(directory)),
    realpath: memoize((file) => ts.sys.realpath?.(file) ?? file),
    readFile: (file) => ts.sys.readFile(file),
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getDirectories: (directory) => ts.sys.getDirectories(directory),
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  };
}

/**
 * Classifies import specifiers using TypeScript's module resolution. Only
 * files in `nodeIds` (the discovered source files) become internal targets.
 */
export class ImportResolver {
  private readonly realPaths = new Map<string, string>();
  private readonly host = createCachingHost();

  constructor(
    private readonly root: string,
    private readonly nodeIds: ReadonlySet<string>,
  ) {}

  resolve(
    specifier: string,
    containingFile: string,
    mode: ts.ResolutionMode,
    project: ProjectConfig,
  ): ResolutionResult {
    if (isBuiltin(specifier)) {
      return { kind: 'external', packageName: specifier.replace(/^node:/, ''), builtin: true };
    }

    const { resolvedModule } = ts.resolveModuleName(
      specifier,
      containingFile,
      project.options,
      this.host,
      project.cache,
      undefined,
      mode,
    );
    if (resolvedModule) return this.classify(specifier, resolvedModule);

    if (isPathSpecifier(specifier)) {
      // TypeScript only resolves code; an existing asset (e.g. ./styles.css) is still found.
      const target = path.resolve(path.dirname(containingFile), specifier);
      if (isFile(target)) {
        const rel = toRelative(this.root, this.real(target));
        return rel === null
          ? { kind: 'excluded', reason: 'outside-root', target: null }
          : { kind: 'excluded', reason: 'non-source-file', target: rel };
      }
      return { kind: 'unresolved', reason: 'file-not-found' };
    }
    if (specifier.startsWith('#'))
      return { kind: 'unresolved', reason: 'package-import-not-found' };
    if (matchesPathAlias(specifier, project.options.paths)) {
      return { kind: 'unresolved', reason: 'alias-not-found' };
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(specifier)) {
      return { kind: 'unresolved', reason: 'unsupported-specifier' };
    }
    return { kind: 'unresolved', reason: 'package-not-found' };
  }

  private classify(specifier: string, resolved: ts.ResolvedModuleFull): ResolutionResult {
    // Discovery never follows symlinks, so a path that is already a node is real; only
    // misses (symlinks, letter-case differences) need the slower realpath lookup.
    const direct = toRelative(this.root, resolved.resolvedFileName);
    if (direct !== null && this.nodeIds.has(direct)) return { kind: 'internal', target: direct };
    const file = this.real(resolved.resolvedFileName);
    const rel = toRelative(this.root, file);
    if (rel !== null && this.nodeIds.has(rel)) return { kind: 'internal', target: rel };
    if (resolved.isExternalLibraryImport || /[\\/]node_modules[\\/]/.test(file)) {
      // @types/* ids are mangled (`@types/babel__core`), so fall back to the specifier.
      const id = resolved.packageId?.name;
      const packageName = id && !id.startsWith('@types/') ? id : packageNameOf(specifier);
      return { kind: 'external', packageName, builtin: false };
    }
    if (rel === null) return { kind: 'excluded', reason: 'outside-root', target: null };
    return {
      kind: 'excluded',
      reason: isSourceFile(rel) ? 'excluded-by-pattern' : 'non-source-file',
      target: rel,
    };
  }

  private real(file: string): string {
    let real = this.realPaths.get(file);
    if (real === undefined) {
      real = realPath(file);
      this.realPaths.set(file, real);
    }
    return real;
  }
}
