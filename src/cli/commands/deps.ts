import { Option, type Command } from 'commander';
import { JSON_SCHEMA_VERSION } from '../../analysis/json.js';
import type { AnalysisResult, GraphEdge } from '../../analysis/types.js';
import { logger } from '../../utils/logger.js';
import {
  formatOption,
  loadAnalysis,
  printJson,
  rootOption,
  type OutputFormat,
} from '../options.js';
import { formatEdge, formatReference } from '../output.js';

type Direction = 'outgoing' | 'incoming' | 'both';

interface DepsOptions {
  root: string;
  direction: Direction;
  format: OutputFormat;
}

export function registerDepsCommand(program: Command): void {
  program
    .command('deps')
    .description('Show what a file imports, or which files import it')
    .argument('<file>', 'source file, relative to the current directory or absolute')
    .addOption(rootOption())
    .addOption(
      new Option(
        '-d, --direction <direction>',
        'outgoing: what <file> imports; incoming: what imports <file>',
      )
        .choices(['outgoing', 'incoming', 'both'])
        .default('outgoing'),
    )
    .addOption(formatOption())
    .action(async (file: string, options: DepsOptions) => {
      const { runAnalysis, resolveNodeArgument } = await loadAnalysis();
      const { result } = await runAnalysis(options.root);
      const id = resolveNodeArgument(result, file);
      const report = inspectFile(result, id, options.direction);
      if (options.format === 'json') printJson({ schemaVersion: JSON_SCHEMA_VERSION, ...report });
      else logger.info(formatDeps(report));
    });
}

export interface FileDependencies {
  file: string;
  direction: Direction;
  outgoing: {
    internal: GraphEdge[];
    external: (AnalysisResult['external'][number]['references'][number] & {
      packageName: string;
    })[];
    excluded: AnalysisResult['excluded'];
    unresolved: AnalysisResult['unresolved'];
  } | null;
  incoming: GraphEdge[] | null;
  /** The cyclic component containing the file, if any. */
  cycle: { nodes: string[]; representativePath: string[] } | null;
}

export function inspectFile(
  result: AnalysisResult,
  id: string,
  direction: Direction,
): FileDependencies {
  const { graph } = result;
  const index = graph.indexOf.get(id) as number;
  const edgesTo = (targets: number[], outgoing: boolean) =>
    targets.map(
      (other) =>
        (outgoing ? graph.edgeBetween(index, other) : graph.edgeBetween(other, index)) as GraphEdge,
    );
  const cycle = result.cycles.find((candidate) => candidate.nodes.includes(id));
  return {
    file: id,
    direction,
    outgoing:
      direction === 'incoming'
        ? null
        : {
            internal: edgesTo(graph.outgoing[index] ?? [], true),
            external: result.external.flatMap((entry) =>
              entry.references
                .filter((reference) => reference.file === id)
                .map((reference) => ({ ...reference, packageName: entry.packageName })),
            ),
            excluded: result.excluded.filter((item) => item.file === id),
            unresolved: result.unresolved.filter((item) => item.file === id),
          },
    incoming: direction === 'outgoing' ? null : edgesTo(graph.incoming[index] ?? [], false),
    cycle: cycle ? { nodes: cycle.nodes, representativePath: cycle.representativePath } : null,
  };
}

function section(title: string, lines: string[]): string[] {
  return [`  ${title} (${String(lines.length)})${lines.length > 0 ? ':' : ''}`, ...lines];
}

export function formatDeps(report: FileDependencies): string {
  const lines = [`Dependencies of ${report.file}`];
  if (report.outgoing) {
    const { internal, external, excluded, unresolved } = report.outgoing;
    lines.push(
      '',
      `Outgoing (what ${report.file} imports):`,
      ...section(
        'Internal files',
        internal.map((edge) => formatEdge(edge.to, edge)),
      ),
      ...section(
        'External packages',
        external.map((reference) => `    ${reference.packageName}  ${formatReference(reference)}`),
      ),
      ...section(
        'Resolved, but not analyzed',
        excluded.map(
          (item) =>
            `    ${item.target ?? '(outside root)'}  ${formatReference(item)} [${item.reason}]`,
        ),
      ),
      ...section(
        'Unresolved',
        unresolved.map((item) => `    ${formatReference(item)} [${item.reason}]`),
      ),
    );
  }
  if (report.incoming) {
    lines.push(
      '',
      `Incoming (files that import ${report.file}):`,
      ...section(
        'Internal files',
        report.incoming.map((edge) => formatEdge(edge.from, edge)),
      ),
    );
  }
  lines.push(
    '',
    report.cycle
      ? `Circular dependency: ${report.file} is in a cyclic component of ${String(report.cycle.nodes.length)} file(s). Representative cycle: ${report.cycle.representativePath.join(' -> ')}`
      : `Circular dependency: ${report.file} is not part of a cycle.`,
  );
  return lines.join('\n');
}
