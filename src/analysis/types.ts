/**
 * Data model of a dependency analysis. All paths are repository-relative and
 * use forward slashes, regardless of platform.
 */

export type DependencyKind =
  /** `import x from './m'`, `import { x } from`, `import * as x from` */
  | 'import'
  /** `import './m'` */
  | 'side-effect'
  /** `export { x } from './m'`, `export * from`, `export * as x from` */
  | 're-export'
  /** `import('./m')` with a string literal specifier */
  | 'dynamic-import'
  /** `require('./m')` with a string literal specifier */
  | 'require'
  /** `import x = require('./m')` (TypeScript) */
  | 'import-equals'
  /** `type T = import('./m').T` (TypeScript import type) */
  | 'import-type';

export interface SourceLocation {
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

/** One static import found in a source file. */
export interface ImportReference extends SourceLocation {
  /** Module specifier exactly as written. */
  specifier: string;
  kind: DependencyKind;
  /** True when the import is erased at runtime (`import type`, `export type`, type queries). */
  typeOnly: boolean;
}

export type UnresolvedReason =
  | 'file-not-found'
  | 'alias-not-found'
  | 'package-not-found'
  | 'package-import-not-found'
  | 'unsupported-specifier';

export type ExcludedReason =
  /** Resolved to an existing file that is not a supported source file (e.g. .json, .css). */
  | 'non-source-file'
  /** Resolved to a source file under the root that discovery excluded. */
  | 'excluded-by-pattern'
  /** Resolved to a file outside the analysis root. */
  | 'outside-root';

/** How one import specifier was resolved. */
export type ResolutionResult =
  | { kind: 'internal'; target: string }
  | { kind: 'external'; packageName: string; builtin: boolean }
  | { kind: 'excluded'; reason: ExcludedReason; target: string | null }
  | { kind: 'unresolved'; reason: UnresolvedReason };

export type NodeStatus = 'parsed' | 'parse-errors' | 'unreadable';

export interface GraphNode {
  /** Stable identifier: the repository-relative path. */
  id: string;
  path: string;
  extension: string;
  status: NodeStatus;
  /** Repository-relative tsconfig used to resolve this file's imports, or null for defaults. */
  tsconfig: string | null;
}

/** A located import reference from a known file. */
export interface FileReference extends ImportReference {
  file: string;
}

/**
 * All imports from `from` to `to`. Parallel imports between the same two files
 * are merged into one edge; every individual import is kept in `references`.
 */
export interface GraphEdge {
  from: string;
  to: string;
  /** True only when every reference is type-only. */
  typeOnly: boolean;
  references: ImportReference[];
}

export interface DependencyGraph {
  /** Sorted by id. */
  nodes: GraphNode[];
  /** Sorted by (from, to). */
  edges: GraphEdge[];
  /** Node index → indices of outgoing neighbours, ascending. */
  outgoing: number[][];
  /** Node index → indices of incoming neighbours, ascending. */
  incoming: number[][];
  indexOf: ReadonlyMap<string, number>;
  /** Looks up the edge between two node indices. */
  edgeBetween(from: number, to: number): GraphEdge | undefined;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'parse-error'
  | 'read-error'
  | 'unresolved-import'
  | 'unanalyzable-import'
  | 'shadowed-require'
  | 'tsconfig-error'
  | 'discovery-error';

export interface AnalysisDiagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
}

export interface Cycle {
  /** Members of the strongly connected component, sorted. */
  nodes: string[];
  /**
   * One shortest cycle through the first member, starting and ending with it.
   * A component can contain many other cycles; this is a representative only.
   */
  representativePath: string[];
  /** All edges between members of the component. */
  edges: GraphEdge[];
  /** False when the cycle disappears if type-only imports are ignored. */
  runtime: boolean;
}

export interface DiscoveryStats {
  filesDiscovered: number;
  directoriesExcluded: number;
  filesExcluded: number;
  symlinksSkipped: number;
  unreadableDirectories: number;
}

export interface AnalysisSummary extends DiscoveryStats {
  filesParsed: number;
  filesWithParseErrors: number;
  filesUnreadable: number;
  importReferences: number;
  internalReferences: number;
  externalReferences: number;
  externalPackages: number;
  excludedReferences: number;
  unresolvedReferences: number;
  unanalyzableImports: number;
  nodes: number;
  edges: number;
  typeOnlyEdges: number;
  stronglyConnectedComponents: number;
  cyclicComponents: number;
  runtimeCycles: number;
  errors: number;
  warnings: number;
  durationMs: number;
}

export interface ExternalDependency {
  packageName: string;
  builtin: boolean;
  references: FileReference[];
}

export interface UnresolvedDependency extends FileReference {
  reason: UnresolvedReason;
}

export interface ExcludedDependency extends FileReference {
  reason: ExcludedReason;
  target: string | null;
}

export interface AnalysisSettings {
  configFile: string | null;
  include: string[];
  exclude: string[];
  builtinExcludedDirectories: string[];
  builtinExcludedFiles: string[];
  extensions: string[];
  /** Repository-relative tsconfig files that were loaded. */
  tsconfigs: string[];
}

export type AnalysisStatus = 'completed' | 'completed-with-diagnostics';

export interface AnalysisResult {
  /** Absolute root (never serialized to JSON). */
  root: string;
  status: AnalysisStatus;
  settings: AnalysisSettings;
  graph: DependencyGraph;
  external: ExternalDependency[];
  unresolved: UnresolvedDependency[];
  excluded: ExcludedDependency[];
  cycles: Cycle[];
  diagnostics: AnalysisDiagnostic[];
  summary: AnalysisSummary;
}
