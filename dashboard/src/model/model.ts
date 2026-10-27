/**
 * Indexes a validated report for the views: modules (source files) by index,
 * adjacency in both directions, layer membership taken from the report (never
 * guessed), cycle membership, and the findings that involve each module.
 */
import type { Finding } from '../contract/load';
import type { ImportRef, Report, ReportCycle, UnresolvedDependency } from '../contract/report';

export const UNCLASSIFIED = '(unclassified)';
/** Layers past this many share one neutral colour (categorical slots are never cycled). */
export const LAYER_COLORS = 8;

export interface ModuleInfo {
  index: number;
  id: string;
  directory: string;
  name: string;
  status: string;
  /** Configured layer, or null when no layer pattern matches the file. */
  layer: string | null;
  /** Edge indices. */
  outgoing: number[];
  incoming: number[];
  packages: string[];
  unresolved: UnresolvedDependency[];
  /** Index into Model.cycles, or null. */
  cycle: number | null;
  /** Findings whose source is this module. */
  findings: Finding[];
  /** Findings where this module is the imported file or a cycle member (not the source). */
  involvedIn: Finding[];
}

export interface EdgeInfo {
  index: number;
  from: number;
  to: number;
  typeOnly: boolean;
  kinds: string[];
  references: ImportRef[];
  /** Both ends in the same cyclic component. */
  cycle: number | null;
  /** Finding ids that this edge causes. */
  findings: string[];
}

export interface PackageInfo {
  name: string;
  builtin: boolean;
  /** Module indices that import it. */
  importers: number[];
  references: number;
}

export interface LayerInfo {
  name: string;
  /** Categorical colour slot (0-based), or null past LAYER_COLORS. */
  slot: number | null;
  patterns: string[];
  modules: number[];
}

export interface Model {
  report: Report;
  modules: ModuleInfo[];
  byId: Map<string, number>;
  edges: EdgeInfo[];
  /** `${from}:${to}` (module indices) -> edge index. */
  edgeIndex: Map<string, number>;
  out: number[][];
  in: number[][];
  layers: LayerInfo[];
  layerByName: Map<string, LayerInfo>;
  unclassified: number[];
  cycles: ReportCycle[];
  packages: PackageInfo[];
  findings: Finding[];
  findingById: Map<string, Finding>;
}

const unique = (values: string[]) => [...new Set(values)].sort();

export function buildModel(report: Report, findings: Finding[]): Model {
  const byId = new Map(report.nodes.map((node, index) => [node.id, index]));
  const layerOf = new Map<string, string>();
  for (const layer of report.architecture.layers) {
    for (const file of layer.files) layerOf.set(file, layer.name);
  }
  const cycleOf = new Map<string, number>();
  report.cycles.forEach((cycle, index) => {
    for (const id of cycle.nodes) cycleOf.set(id, index);
  });

  const modules: ModuleInfo[] = report.nodes.map((node, index) => {
    const slash = node.id.lastIndexOf('/');
    return {
      index,
      id: node.id,
      directory: slash === -1 ? '' : node.id.slice(0, slash),
      name: slash === -1 ? node.id : node.id.slice(slash + 1),
      status: node.status,
      layer: layerOf.get(node.id) ?? null,
      outgoing: [],
      incoming: [],
      packages: [],
      unresolved: [],
      cycle: cycleOf.get(node.id) ?? null,
      findings: [],
      involvedIn: [],
    };
  });
  const at = (id: string) => modules[byId.get(id) ?? -1];

  const edgeIndex = new Map<string, number>();
  const out = modules.map(() => [] as number[]);
  const inn = modules.map(() => [] as number[]);
  const edges: EdgeInfo[] = report.edges.map((edge, index) => {
    const from = byId.get(edge.from) ?? 0;
    const to = byId.get(edge.to) ?? 0;
    edgeIndex.set(`${String(from)}:${String(to)}`, index);
    out[from]?.push(to);
    inn[to]?.push(from);
    modules[from]?.outgoing.push(index);
    modules[to]?.incoming.push(index);
    const fromCycle = cycleOf.get(edge.from);
    return {
      index,
      from,
      to,
      typeOnly: edge.typeOnly,
      kinds: unique(edge.references.map((reference) => reference.kind)),
      references: edge.references,
      cycle: fromCycle !== undefined && fromCycle === cycleOf.get(edge.to) ? fromCycle : null,
      findings: [],
    };
  });

  const packages = report.externalDependencies.map((dependency) => {
    const importers = [...new Set(dependency.references.map((r) => byId.get(r.file) ?? -1))]
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    for (const index of importers) modules[index]?.packages.push(dependency.packageName);
    return {
      name: dependency.packageName,
      builtin: dependency.builtin,
      importers,
      references: dependency.references.length,
    };
  });
  for (const unresolved of report.unresolvedDependencies)
    at(unresolved.file)?.unresolved.push(unresolved);

  const findingById = new Map<string, Finding>();
  for (const finding of findings) {
    findingById.set(finding.id, finding);
    if (finding.file === null) continue;
    const source = at(finding.file);
    source?.findings.push(finding);
    const target = finding.target;
    if (target?.kind === 'file') {
      at(target.path)?.involvedIn.push(finding);
      const edge = edgeIndex.get(
        `${String(byId.get(finding.file))}:${String(byId.get(target.path))}`,
      );
      if (edge !== undefined) edges[edge]?.findings.push(finding.id);
    } else if (target?.kind === 'cycle') {
      for (const file of target.files)
        if (file !== finding.file) at(file)?.involvedIn.push(finding);
      const members = new Set(target.files.map((file) => byId.get(file)));
      for (const edge of edges) {
        if (members.has(edge.from) && members.has(edge.to)) edge.findings.push(finding.id);
      }
    }
  }

  const layers: LayerInfo[] = report.architecture.layers.map((layer, index) => ({
    name: layer.name,
    slot: index < LAYER_COLORS ? index : null,
    patterns: layer.patterns,
    modules: layer.files.map((file) => byId.get(file) ?? -1).filter((i) => i >= 0),
  }));

  return {
    report,
    modules,
    byId,
    edges,
    edgeIndex,
    out,
    in: inn,
    layers,
    layerByName: new Map(layers.map((layer) => [layer.name, layer])),
    unclassified: modules.filter((module) => module.layer === null).map((module) => module.index),
    cycles: report.cycles,
    packages,
    findings,
    findingById,
  };
}

/** Whether the report configured layers at all (unclassified only means something then). */
export const hasLayers = (model: Model) => model.layers.length > 0;
