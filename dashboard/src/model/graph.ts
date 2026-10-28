/** Pure graph queries for the views: traversal, paths, filters, grouping, highlight sets. */
import type { Finding } from '../contract/load';
import { UNCLASSIFIED, type EdgeInfo, type Model } from './model';

/** Rendering more elements than this at once is slow and unreadable; the view asks first. */
export const RENDER_LIMIT = { nodes: 1500, edges: 6000 } as const;
/** The force layout is quadratic; above this it is not offered. */
export const FORCE_LAYOUT_LIMIT = 600;

/** Modules reachable from `starts` (excluded unless reached again), with their distance. */
export function reach(
  model: Model,
  starts: number[],
  direction: 'out' | 'in',
  maxDepth = Number.POSITIVE_INFINITY,
): Map<number, number> {
  const adjacency = direction === 'out' ? model.out : model.in;
  const depth = new Map<number, number>();
  let frontier = starts;
  for (let level = 1; frontier.length > 0 && level <= maxDepth; level++) {
    const next: number[] = [];
    for (const node of frontier) {
      for (const neighbour of adjacency[node] ?? []) {
        if (!depth.has(neighbour)) {
          depth.set(neighbour, level);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/** One shortest import path from `from` to `to` (module indices), or null. */
export function shortestPath(model: Model, from: number, to: number): number[] | null {
  if (from === to) return [from];
  const previous = new Map<number, number>([[from, from]]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const node of frontier) {
      for (const neighbour of model.out[node] ?? []) {
        if (previous.has(neighbour)) continue;
        previous.set(neighbour, node);
        if (neighbour === to) {
          const path = [to];
          for (let at = node; at !== from; at = previous.get(at) ?? from) path.push(at);
          path.push(from);
          return path.reverse();
        }
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return null;
}

export interface GraphFilters {
  /** Substring of the path (case-insensitive). */
  query: string;
  /** Layer names to show (UNCLASSIFIED for files without a layer); empty shows all. */
  layers: string[];
  /** Path prefix, e.g. "src/domain". */
  directory: string;
  /** Only files importing this external package. */
  packageName: string;
  onlyViolations: boolean;
  onlyCycles: boolean;
  /** Dependency kinds to show; empty shows all. */
  kinds: string[];
  includeTypeOnly: boolean;
  showPackages: boolean;
}

export const DEFAULT_FILTERS: GraphFilters = {
  query: '',
  layers: [],
  directory: '',
  packageName: '',
  onlyViolations: false,
  onlyCycles: false,
  kinds: [],
  includeTypeOnly: true,
  showPackages: false,
};

export const isDefaultFilters = (filters: GraphFilters) =>
  JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

/** An edge is shown when one of its imports has a shown kind (and type-only imports are shown, if it is one). */
export function edgeVisible(edge: EdgeInfo, filters: GraphFilters): boolean {
  return edge.references.some(
    (reference) =>
      (filters.kinds.length === 0 || filters.kinds.includes(reference.kind)) &&
      (filters.includeTypeOnly || !reference.typeOnly),
  );
}

const underDirectory = (id: string, directory: string) => {
  const prefix = directory.replace(/\/+$/, '');
  return prefix === '' || id === prefix || id.startsWith(`${prefix}/`);
};

export function visibleModules(model: Model, filters: GraphFilters): number[] {
  const query = filters.query.trim().toLowerCase();
  const pkg =
    filters.packageName === ''
      ? undefined
      : model.packages.find((p) => p.name === filters.packageName);
  const importers = pkg ? new Set(pkg.importers) : undefined;
  return model.modules
    .filter(
      (module) =>
        (query === '' || module.id.toLowerCase().includes(query)) &&
        (filters.layers.length === 0 || filters.layers.includes(module.layer ?? UNCLASSIFIED)) &&
        underDirectory(module.id, filters.directory) &&
        (!importers || importers.has(module.index)) &&
        (!filters.onlyViolations || module.findings.length > 0 || module.involvedIn.length > 0) &&
        (!filters.onlyCycles || module.cycle !== null),
    )
    .map((module) => module.index);
}

/** The first `depth` directory segments of a path ("src/domain" for depth 2). */
export function folderOf(id: string, depth: number): string {
  const segments = id.split('/');
  segments.pop();
  return segments.length === 0 ? '.' : segments.slice(0, depth).join('/');
}

export interface FolderGraph {
  folders: { id: string; modules: number[] }[];
  edges: { from: string; to: string; count: number; typeOnly: boolean; findings: number }[];
}

/** Aggregates modules into folders; edges are counted, never dropped. */
export function groupByFolder(
  model: Model,
  modules: number[],
  depth: number,
  filters: GraphFilters,
): FolderGraph {
  const folderOfModule = new Map<number, string>();
  const folders = new Map<string, number[]>();
  for (const index of modules) {
    const module = model.modules[index];
    if (!module) continue;
    const folder = folderOf(module.id, depth);
    folderOfModule.set(index, folder);
    folders.set(folder, [...(folders.get(folder) ?? []), index]);
  }
  const edges = new Map<string, FolderGraph['edges'][number]>();
  for (const edge of model.edges) {
    const from = folderOfModule.get(edge.from);
    const to = folderOfModule.get(edge.to);
    if (from === undefined || to === undefined || from === to || !edgeVisible(edge, filters))
      continue;
    const key = `${from}\0${to}`;
    const entry = edges.get(key) ?? { from, to, count: 0, typeOnly: true, findings: 0 };
    entry.count++;
    entry.typeOnly &&= edge.typeOnly;
    entry.findings += edge.findings.length;
    edges.set(key, entry);
  }
  return {
    folders: [...folders.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, members]) => ({ id, modules: members })),
    edges: [...edges.values()],
  };
}

export type Focus =
  | {
      kind: 'module';
      module: number;
      mode: 'neighbours' | 'dependencies' | 'dependents';
      depth: number;
    }
  | { kind: 'path'; from: number; to: number }
  | { kind: 'cycle'; cycle: number }
  | { kind: 'finding'; finding: Finding }
  | { kind: 'edge'; edge: number };

export interface Highlight {
  modules: Set<number>;
  edges: Set<number>;
  /** False when a path was asked for and none exists. */
  found: boolean;
}

function edgesAlong(model: Model, path: number[]): Set<number> {
  const edges = new Set<number>();
  for (let i = 1; i < path.length; i++) {
    const edge = model.edgeIndex.get(`${String(path[i - 1])}:${String(path[i])}`);
    if (edge !== undefined) edges.add(edge);
  }
  return edges;
}

function edgesWithin(model: Model, modules: Set<number>): Set<number> {
  return new Set(
    model.edges
      .filter((edge) => modules.has(edge.from) && modules.has(edge.to))
      .map((edge) => edge.index),
  );
}

/** Which modules and edges a focus lights up; everything else is dimmed. */
export function highlightFor(model: Model, focus: Focus): Highlight {
  switch (focus.kind) {
    case 'module': {
      const modules = new Set([focus.module]);
      const edges = new Set<number>();
      const directions: ('out' | 'in')[] =
        focus.mode === 'dependencies'
          ? ['out']
          : focus.mode === 'dependents'
            ? ['in']
            : ['out', 'in'];
      const depth = focus.mode === 'neighbours' ? 1 : focus.depth;
      for (const direction of directions) {
        const reached = reach(model, [focus.module], direction, depth);
        for (const index of reached.keys()) modules.add(index);
        // Only edges that walk outward in this direction, so the reach reads as a tree.
        for (const edge of model.edges) {
          const [near, far] = direction === 'out' ? [edge.from, edge.to] : [edge.to, edge.from];
          const nearDepth = near === focus.module ? 0 : reached.get(near);
          if (nearDepth !== undefined && nearDepth < depth && reached.has(far))
            edges.add(edge.index);
        }
      }
      return { modules, edges, found: true };
    }
    case 'path': {
      const path = shortestPath(model, focus.from, focus.to);
      if (!path)
        return { modules: new Set([focus.from, focus.to]), edges: new Set(), found: false };
      return { modules: new Set(path), edges: edgesAlong(model, path), found: true };
    }
    case 'cycle': {
      const modules = new Set(
        (model.cycles[focus.cycle]?.nodes ?? []).map((id) => model.byId.get(id) ?? -1),
      );
      return { modules, edges: edgesWithin(model, modules), found: true };
    }
    case 'finding': {
      const { finding } = focus;
      const ids =
        finding.target?.kind === 'cycle'
          ? finding.target.files
          : (finding.path ?? [
              finding.file,
              finding.target?.kind === 'file' ? finding.target.path : null,
            ]);
      const path = ids
        .filter((id): id is string => id !== null)
        .map((id) => model.byId.get(id) ?? -1);
      const modules = new Set(path.filter((index) => index >= 0));
      const edges =
        finding.target?.kind === 'cycle' ? edgesWithin(model, modules) : edgesAlong(model, path);
      for (const edge of model.edges) if (edge.findings.includes(finding.id)) edges.add(edge.index);
      return { modules, edges, found: true };
    }
    case 'edge': {
      const edge = model.edges[focus.edge];
      return {
        modules: new Set(edge ? [edge.from, edge.to] : []),
        edges: new Set([focus.edge]),
        found: true,
      };
    }
  }
}

/**
 * Deterministic "grouped" layout: one band per configured layer (in
 * configuration order, unclassified last), or per top-level folder when no
 * layers are configured. Cheap enough for thousands of nodes. Returns the
 * band label positions too.
 */
export function groupedPositions(
  ids: { id: string; group: string }[],
  groupOrder: string[],
): {
  positions: Map<string, { x: number; y: number }>;
  bands: { group: string; x: number; y: number }[];
} {
  const groups = new Map<string, string[]>();
  for (const { id, group } of ids) groups.set(group, [...(groups.get(group) ?? []), id]);
  const order = [
    ...groupOrder.filter((group) => groups.has(group)),
    ...[...groups.keys()].filter((group) => !groupOrder.includes(group)).sort(),
  ];
  const positions = new Map<string, { x: number; y: number }>();
  const bands: { group: string; x: number; y: number }[] = [];
  // Roughly as wide as tall, so the graph fits a landscape canvas at a readable zoom.
  const perRow = Math.max(4, Math.ceil(Math.sqrt(ids.length)));
  const spacing = { x: 200, y: 76, band: 64 };
  let y = 0;
  for (const group of order) {
    const members = (groups.get(group) ?? []).sort();
    members.forEach((id, i) => {
      const row = Math.floor(i / perRow);
      // Odd rows shift half a column, so edges pass between labels instead of through them.
      const shift = row % 2 === 1 ? spacing.x / 2 : 0;
      positions.set(id, { x: (i % perRow) * spacing.x + shift, y: y + row * spacing.y });
    });
    bands.push({ group, x: -spacing.x * 0.9, y });
    y += Math.ceil(members.length / perRow) * spacing.y + spacing.band;
  }
  return { positions, bands };
}
