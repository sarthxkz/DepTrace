import { statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { toPosix, toRelative } from './paths.js';
import type { AnalysisDiagnostic } from './types.js';

/** Compiler settings used to resolve the imports of one file. */
export interface ProjectConfig {
  /** Absolute tsconfig path, or null when defaults are used. */
  configPath: string | null;
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
}

/** Used when a file has no tsconfig.json between it and the root. */
const DEFAULT_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ESNext,
};

// TS18003 "No inputs were found": irrelevant, discovery does not use tsconfig file lists.
const IGNORED_CONFIG_ERRORS = new Set([18003]);

const canonical = (fileName: string): string =>
  ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Picks the tsconfig for each file: the nearest `tsconfig.json` in the file's
 * directory or an ancestor, never above the root. When that config has project
 * `references` (a "solution" config), the first referenced project whose file
 * list contains the file is used instead.
 */
export class ProjectLocator {
  private readonly nearest = new Map<string, string | null>();
  private readonly projects = new Map<
    string,
    ProjectConfig & { references: ReferencedProject[] }
  >();
  private readonly extendedCache = new Map<string, ts.ExtendedConfigCacheEntry>();
  private readonly defaults: ProjectConfig;

  constructor(
    private readonly root: string,
    private readonly diagnostics: AnalysisDiagnostic[],
  ) {
    this.defaults = createProject(null, DEFAULT_OPTIONS);
  }

  /** Repository-relative paths of every tsconfig loaded so far, sorted. */
  get loadedConfigs(): string[] {
    const names = new Set<string>();
    for (const project of this.projects.values()) {
      for (const config of [project, ...project.references]) {
        if (config.configPath)
          names.add(toRelative(this.root, config.configPath) ?? config.configPath);
      }
    }
    return [...names].sort();
  }

  forFile(file: string): ProjectConfig {
    const configPath = this.findNearest(path.dirname(file));
    if (!configPath) return this.defaults;
    const project = this.load(configPath);
    const key = canonical(toPosix(file));
    return project.references.find((reference) => reference.fileNames.has(key)) ?? project;
  }

  private findNearest(directory: string): string | null {
    const cached = this.nearest.get(directory);
    if (cached !== undefined) return cached;
    const candidate = path.join(directory, 'tsconfig.json');
    const parent = path.dirname(directory);
    const atRoot = toRelative(this.root, directory) === '' || parent === directory;
    // TypeScript requires forward slashes in file names (it asserts on Windows paths).
    const found = isFile(candidate) ? toPosix(candidate) : atRoot ? null : this.findNearest(parent);
    this.nearest.set(directory, found);
    return found;
  }

  private load(configPath: string): ProjectConfig & { references: ReferencedProject[] } {
    const cached = this.projects.get(configPath);
    if (cached) return cached;
    // The solution config's own file list is not needed, so skip the directory walk.
    const parsed = this.parse(configPath, () => []);
    const references = (parsed?.projectReferences ?? []).map((reference) => {
      const referencePath = ts.resolveProjectReferencePath(reference);
      const referenced = this.parse(referencePath, (...args) => ts.sys.readDirectory(...args));
      return {
        ...createProject(referencePath, referenced?.options ?? DEFAULT_OPTIONS),
        fileNames: new Set((referenced?.fileNames ?? []).map(canonical)),
      };
    });
    const project = {
      ...createProject(configPath, parsed?.options ?? DEFAULT_OPTIONS),
      references,
    };
    this.projects.set(configPath, project);
    return project;
  }

  private parse(
    configPath: string,
    readDirectory: ts.ParseConfigFileHost['readDirectory'],
  ): ts.ParsedCommandLine | undefined {
    const report = (diagnostic: ts.Diagnostic) => {
      if (IGNORED_CONFIG_ERRORS.has(diagnostic.code)) return;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      this.diagnostics.push({
        severity: 'error',
        code: 'tsconfig-error',
        message: `${message} (falling back to default resolution settings where needed)`,
        file: toRelative(this.root, diagnostic.file?.fileName ?? configPath) ?? toPosix(configPath),
        line: null,
        column: null,
      });
    };
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      undefined,
      { ...ts.sys, readDirectory, onUnRecoverableConfigFileDiagnostic: report },
      this.extendedCache,
    );
    parsed?.errors.forEach(report);
    return parsed;
  }
}

interface ReferencedProject extends ProjectConfig {
  fileNames: Set<string>;
}

function createProject(configPath: string | null, options: ts.CompilerOptions): ProjectConfig {
  // allowJs/resolveJsonModule let JavaScript and JSON targets resolve, so they can be classified.
  const resolved = { ...options, allowJs: true, resolveJsonModule: true };
  const directory = configPath ? path.dirname(configPath) : ts.sys.getCurrentDirectory();
  return {
    configPath,
    options: resolved,
    cache: ts.createModuleResolutionCache(directory, canonical, resolved),
  };
}
