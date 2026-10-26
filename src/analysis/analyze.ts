import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  BUILTIN_EXCLUDED_DIRECTORIES,
  BUILTIN_EXCLUDED_FILES,
  compareStrings,
  discoverSourceFiles,
  SOURCE_EXTENSIONS,
} from './discovery.js';
import { buildGraph, findCycles, type GraphLink } from './graph.js';
import { extractImports, getParseDiagnostics, parseSourceFile } from './parser.js';
import { toPosix, toRelative } from './paths.js';
import { ProjectLocator } from './project.js';
import { ImportResolver } from './resolver.js';
import type {
  AnalysisDiagnostic,
  AnalysisResult,
  ExcludedDependency,
  ExternalDependency,
  FileReference,
  GraphNode,
  UnresolvedDependency,
  UnresolvedReason,
} from './types.js';

export interface AnalyzeOptions {
  include: string[];
  exclude: string[];
  /** Repository-relative config file name, recorded in the settings. */
  configFile: string | null;
  /** Called periodically while files are processed. */
  onProgress?: (processed: number, total: number) => void;
}

const PROGRESS_INTERVAL = 200;

const UNRESOLVED_HINTS: Record<UnresolvedReason, string> = {
  'file-not-found': 'no matching file exists',
  'alias-not-found': 'it matches a tsconfig "paths" alias, but no target file exists',
  'package-not-found': 'the package is not installed or not resolvable from this file',
  'package-import-not-found': 'no matching "imports" entry in package.json',
  'unsupported-specifier': 'URL-style specifiers are not supported',
};

function compareFileReferences(a: FileReference, b: FileReference): number {
  return compareStrings(a.file, b.file) || a.line - b.line || a.column - b.column;
}

/**
 * Statically analyzes the source files under `root` (an absolute, real path).
 * Source code is parsed, never executed.
 */
export async function analyzeRepository(
  root: string,
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  const startedAt = performance.now();
  const discovery = discoverSourceFiles(root, options);
  const diagnostics: AnalysisDiagnostic[] = [...discovery.diagnostics];
  const nodeIds = new Set(discovery.files);
  const locator = new ProjectLocator(root, diagnostics);
  const resolver = new ImportResolver(root, nodeIds);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const externalByName = new Map<string, ExternalDependency>();
  const unresolved: UnresolvedDependency[] = [];
  const excluded: ExcludedDependency[] = [];
  let importReferences = 0;
  let unanalyzableImports = 0;

  const report = (
    severity: AnalysisDiagnostic['severity'],
    code: AnalysisDiagnostic['code'],
    message: string,
    file: string,
    location?: { line: number; column: number },
  ) => {
    diagnostics.push({
      severity,
      code,
      message,
      file,
      line: location?.line ?? null,
      column: location?.column ?? null,
    });
  };

  for (const [position, id] of discovery.files.entries()) {
    if (position % PROGRESS_INTERVAL === 0) {
      options.onProgress?.(position, discovery.files.length);
      // Yield so Ctrl+C and output stay responsive on large repositories.
      await new Promise((resolve) => setImmediate(resolve));
    }
    // Forward slashes: this path is passed to TypeScript, which requires them.
    const file = toPosix(path.join(root, id));
    const extension = path.extname(id);
    const project = locator.forFile(file);
    const tsconfig = project.configPath ? toRelative(root, project.configPath) : null;

    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      nodes.push({ id, path: id, extension, status: 'unreadable', tsconfig });
      report('error', 'read-error', `File could not be read: ${(error as Error).message}`, id);
      continue;
    }

    const format = ts.getImpliedNodeFormatForFile(
      file,
      project.cache.getPackageJsonInfoCache(),
      ts.sys,
      project.options,
    );
    const sourceFile = parseSourceFile(file, text, extension, format);
    const parseErrors = getParseDiagnostics(sourceFile);
    const [firstError] = parseErrors;
    if (firstError) {
      const location =
        firstError.start === undefined
          ? undefined
          : sourceFile.getLineAndCharacterOfPosition(firstError.start);
      const more = parseErrors.length > 1 ? ` (and ${String(parseErrors.length - 1)} more)` : '';
      report(
        'error',
        'parse-error',
        `Syntax error: ${ts.flattenDiagnosticMessageText(firstError.messageText, ' ').replace(/\.$/, '')}${more}. Imports were still extracted where possible.`,
        id,
        location && { line: location.line + 1, column: location.character + 1 },
      );
    }
    nodes.push({
      id,
      path: id,
      extension,
      status: parseErrors.length > 0 ? 'parse-errors' : 'parsed',
      tsconfig,
    });

    const extracted = extractImports(sourceFile);
    for (const item of extracted.unanalyzable) {
      unanalyzableImports++;
      report(
        'warning',
        'unanalyzable-import',
        `${item.kind === 'require' ? 'require()' : 'import()'} with a non-literal specifier cannot be analyzed statically.`,
        id,
        item,
      );
    }
    for (const location of extracted.shadowedRequires) {
      report(
        'info',
        'shadowed-require',
        'require() call ignored: this file declares its own "require", so it is not treated as CommonJS.',
        id,
        location,
      );
    }

    for (const { literal, ...reference } of extracted.imports) {
      importReferences++;
      const mode =
        reference.kind === 'require'
          ? ts.ModuleKind.CommonJS
          : ts.getModeForUsageLocation(sourceFile, literal, project.options);
      const resolution = resolver.resolve(reference.specifier, file, mode, project);
      const located: FileReference = { file: id, ...reference };
      switch (resolution.kind) {
        case 'internal':
          links.push({ from: id, to: resolution.target, reference });
          break;
        case 'external': {
          const entry = externalByName.get(resolution.packageName) ?? {
            packageName: resolution.packageName,
            builtin: resolution.builtin,
            references: [],
          };
          entry.references.push(located);
          externalByName.set(resolution.packageName, entry);
          break;
        }
        case 'excluded':
          excluded.push({ ...located, reason: resolution.reason, target: resolution.target });
          break;
        case 'unresolved':
          unresolved.push({ ...located, reason: resolution.reason });
          report(
            'warning',
            'unresolved-import',
            `Cannot resolve "${reference.specifier}": ${UNRESOLVED_HINTS[resolution.reason]}.`,
            id,
            reference,
          );
          break;
      }
    }
  }
  options.onProgress?.(discovery.files.length, discovery.files.length);

  const graph = buildGraph(nodes, links);
  const { cycles, componentCount } = findCycles(graph);
  const external = [...externalByName.values()].sort((a, b) =>
    compareStrings(a.packageName, b.packageName),
  );
  for (const entry of external) entry.references.sort(compareFileReferences);
  unresolved.sort(compareFileReferences);
  excluded.sort(compareFileReferences);
  diagnostics.sort(
    (a, b) =>
      compareStrings(a.file ?? '', b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      compareStrings(a.code, b.code),
  );

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const filesWithParseErrors = nodes.filter((node) => node.status === 'parse-errors').length;
  const filesUnreadable = nodes.filter((node) => node.status === 'unreadable').length;

  return {
    root,
    status: errors + warnings > 0 ? 'completed-with-diagnostics' : 'completed',
    settings: {
      configFile: options.configFile,
      include: options.include,
      exclude: options.exclude,
      builtinExcludedDirectories: BUILTIN_EXCLUDED_DIRECTORIES,
      builtinExcludedFiles: BUILTIN_EXCLUDED_FILES,
      extensions: SOURCE_EXTENSIONS,
      tsconfigs: locator.loadedConfigs,
    },
    graph,
    external,
    unresolved,
    excluded,
    cycles,
    diagnostics,
    summary: {
      ...discovery.stats,
      filesParsed: nodes.length - filesWithParseErrors - filesUnreadable,
      filesWithParseErrors,
      filesUnreadable,
      importReferences,
      internalReferences: links.length,
      externalReferences: external.reduce((sum, entry) => sum + entry.references.length, 0),
      externalPackages: external.length,
      excludedReferences: excluded.length,
      unresolvedReferences: unresolved.length,
      unanalyzableImports,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      typeOnlyEdges: graph.edges.filter((edge) => edge.typeOnly).length,
      stronglyConnectedComponents: componentCount,
      cyclicComponents: cycles.length,
      runtimeCycles: cycles.filter((cycle) => cycle.runtime).length,
      errors,
      warnings,
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}
