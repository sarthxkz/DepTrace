import type {
  AnalysisDiagnostic,
  AnalysisResult,
  Cycle,
  FileReference,
  GraphEdge,
  ImportReference,
} from '../analysis/types.js';
import { PRODUCT_NAME } from '../core/constants.js';
import type { RepositoryInfo } from '../core/inspect.js';

/** Default number of cycles and diagnostics listed without --verbose. */
const LIST_LIMIT = 20;

const plural = (count: number, word: string, many = `${word}s`) =>
  `${String(count)} ${count === 1 ? word : many}`;

function row(label: string, value: string | number): string {
  return `  ${`${label}:`.padEnd(32)}${String(value)}`;
}

export function formatReference(reference: ImportReference): string {
  const typeOnly = reference.typeOnly && reference.kind !== 'import-type' ? ' type-only' : '';
  return `"${reference.specifier}" ${reference.kind}${typeOnly} ${String(reference.line)}:${String(reference.column)}`;
}

function formatEdgeReferences(edge: GraphEdge): string {
  return edge.references.map(formatReference).join(', ');
}

function formatDiagnostic(diagnostic: AnalysisDiagnostic): string {
  const where =
    diagnostic.file === null
      ? ''
      : diagnostic.line === null
        ? diagnostic.file
        : `${diagnostic.file}:${String(diagnostic.line)}:${String(diagnostic.column ?? 1)}`;
  return `  ${diagnostic.severity.padEnd(8)}${where}  [${diagnostic.code}] ${diagnostic.message}`;
}

function limited<T>(items: T[], verbose: boolean, render: (item: T, index: number) => string[]) {
  const shown = verbose ? items : items.slice(0, LIST_LIMIT);
  const lines = shown.flatMap(render);
  if (shown.length < items.length) {
    lines.push(`  ... ${String(items.length - shown.length)} more (use --verbose to list all)`);
  }
  return lines;
}

function formatCycle(cycle: Cycle, index: number, verbose: boolean): string[] {
  const label = `${plural(cycle.nodes.length, 'file')}${cycle.runtime ? '' : ', type-only imports only'}`;
  const lines = [`  ${String(index + 1)}. (${label}) ${cycle.representativePath.join(' -> ')}`];
  if (verbose) {
    for (const edge of cycle.edges) {
      lines.push(`       ${edge.from} -> ${edge.to}  ${formatEdgeReferences(edge)}`);
    }
  }
  return lines;
}

export function formatScan(info: RepositoryInfo, result: AnalysisResult, verbose: boolean): string {
  const { summary } = result;
  const packageJson =
    info.packageJson === undefined
      ? 'not found'
      : info.packageJson === 'invalid'
        ? 'found, but could not be read as JSON'
        : `${info.packageJson.name ?? '(unnamed)'}${info.packageJson.version ? `@${info.packageJson.version}` : ''}`;
  const cycleKinds = summary.cyclicComponents - summary.runtimeCycles;

  const lines = [
    `${PRODUCT_NAME} dependency analysis`,
    '',
    'Repository',
    row('Directory', info.path),
    row('package.json', packageJson),
    row('tsconfig files used', result.settings.tsconfigs.join(', ') || 'none (default resolution)'),
    row('Git repository', info.gitRoot ? `yes (root: ${info.gitRoot})` : 'not detected'),
    row('Configuration', result.settings.configFile ?? 'none (all supported files)'),
    '',
    'Files',
    row('Source files discovered', summary.filesDiscovered),
    row('Parsed without syntax errors', summary.filesParsed),
    row('Parsed with syntax errors', summary.filesWithParseErrors),
    row('Unreadable', summary.filesUnreadable),
    row(
      'Excluded',
      `${plural(summary.filesExcluded, 'file')}, ${plural(summary.directoriesExcluded, 'directory', 'directories')}`,
    ),
    row('Symbolic links skipped', summary.symlinksSkipped),
    '',
    `Imports (${plural(summary.importReferences, 'reference')})`,
    row('Internal (resolved to a file)', summary.internalReferences),
    row(
      'External',
      `${plural(summary.externalReferences, 'reference')} to ${plural(summary.externalPackages, 'package')}`,
    ),
    row('Resolved, but not analyzed', summary.excludedReferences),
    row('Unresolved', summary.unresolvedReferences),
    row('Unanalyzable (non-literal)', summary.unanalyzableImports),
    '',
    'Dependency graph',
    row('Nodes (files)', summary.nodes),
    row(
      'Edges (file -> file)',
      `${String(summary.edges)} (${String(summary.typeOnlyEdges)} type-only)`,
    ),
    row(
      'Strongly connected components',
      `${String(summary.stronglyConnectedComponents)} (${String(summary.cyclicComponents)} cyclic)`,
    ),
    '',
  ];

  if (result.cycles.length === 0) {
    lines.push('Circular dependencies: none found');
  } else {
    lines.push(
      `Circular dependencies: ${String(summary.cyclicComponents)} cyclic ${summary.cyclicComponents === 1 ? 'component' : 'components'} (${String(summary.runtimeCycles)} runtime, ${String(cycleKinds)} type-only)`,
      ...limited(result.cycles, verbose, (cycle, index) => formatCycle(cycle, index, verbose)),
      '  Each entry shows one representative cycle; a component can contain more.',
    );
  }

  if (verbose && result.external.length > 0) {
    lines.push('', 'External packages');
    for (const entry of result.external) {
      lines.push(
        `  ${entry.packageName}${entry.builtin ? ' (built-in)' : ''}: ${plural(entry.references.length, 'reference')}`,
      );
    }
  }
  if (verbose && result.excluded.length > 0) {
    lines.push('', 'Resolved, but not analyzed');
    for (const item of result.excluded) {
      lines.push(
        `  ${locate(item)}  "${item.specifier}" -> ${item.target ?? '(outside root)'} [${item.reason}]`,
      );
    }
  }

  lines.push('');
  if (result.diagnostics.length === 0) {
    lines.push('Diagnostics: none');
  } else {
    const infos = result.diagnostics.length - summary.errors - summary.warnings;
    lines.push(
      `Diagnostics: ${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')}, ${String(infos)} info`,
      ...limited(result.diagnostics, verbose, (diagnostic) => [formatDiagnostic(diagnostic)]),
    );
  }

  const seconds = (summary.durationMs / 1000).toFixed(2);
  lines.push(
    '',
    result.status === 'completed'
      ? `Analysis completed in ${seconds}s.`
      : `Analysis completed with diagnostics in ${seconds}s. Some dependencies may be missing from the graph; see Diagnostics.`,
  );
  return lines.join('\n');
}

export function locate(reference: FileReference): string {
  return `${reference.file}:${String(reference.line)}:${String(reference.column)}`;
}

export function formatEdge(target: string, edge: GraphEdge): string {
  return `    ${target}  ${formatEdgeReferences(edge)}`;
}
