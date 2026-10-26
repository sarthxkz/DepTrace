import { stronglyConnectedComponents } from './scc.js';
import type { Cycle, DependencyGraph, GraphEdge, GraphNode, ImportReference } from './types.js';

export interface GraphLink {
  from: string;
  to: string;
  reference: ImportReference;
}

function compareReferences(a: ImportReference, b: ImportReference): number {
  return a.line - b.line || a.column - b.column || (a.specifier < b.specifier ? -1 : 1);
}

/**
 * Builds the internal dependency graph. `nodes` must be sorted by id and every
 * link must point between known nodes. Parallel links are merged into one edge.
 */
export function buildGraph(nodes: GraphNode[], links: GraphLink[]): DependencyGraph {
  const n = nodes.length;
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const byKey = new Map<number, GraphEdge>();
  const outgoing: number[][] = nodes.map(() => []);
  const incoming: number[][] = nodes.map(() => []);

  for (const { from, to, reference } of links) {
    const fromIndex = indexOf.get(from);
    const toIndex = indexOf.get(to);
    if (fromIndex === undefined || toIndex === undefined) {
      throw new Error(`Link between unknown nodes: ${from} -> ${to}`);
    }
    const key = fromIndex * n + toIndex;
    const edge = byKey.get(key);
    if (edge) {
      edge.references.push(reference);
      edge.typeOnly &&= reference.typeOnly;
    } else {
      byKey.set(key, { from, to, typeOnly: reference.typeOnly, references: [reference] });
      outgoing[fromIndex]?.push(toIndex);
      incoming[toIndex]?.push(fromIndex);
    }
  }

  for (const list of [...outgoing, ...incoming]) list.sort((a, b) => a - b);
  const keys = [...byKey.keys()].sort((a, b) => a - b);
  const edges = keys.map((key) => {
    const edge = byKey.get(key) as GraphEdge;
    edge.references.sort(compareReferences);
    return edge;
  });

  return {
    nodes,
    edges,
    outgoing,
    incoming,
    indexOf,
    edgeBetween: (from, to) => byKey.get(from * n + to),
  };
}

/**
 * Shortest path (fewest edges) from `from` to `to` by breadth-first search.
 * Neighbours are visited in ascending order, so the result is deterministic.
 * Returns node indices including both ends, or null when `to` is unreachable.
 */
export function shortestPath(
  graph: DependencyGraph,
  from: number,
  to: number,
  allowed: (node: number) => boolean = () => true,
): number[] | null {
  if (from === to) return [from];
  const parent = new Int32Array(graph.nodes.length).fill(-1);
  parent[from] = from;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as number;
    for (const next of graph.outgoing[node] ?? []) {
      if (parent[next] !== -1 || !allowed(next)) continue;
      parent[next] = node;
      if (next === to) return unwind(parent, from, to);
      queue.push(next);
    }
  }
  return null;
}

function unwind(parent: Int32Array, from: number, to: number): number[] {
  const path = [to];
  for (let node = to; node !== from;) {
    node = parent[node] as number;
    path.push(node);
  }
  return path.reverse();
}

function isCyclic(component: number[], hasSelfLoop: (node: number) => boolean): boolean {
  const [first] = component;
  return component.length > 1 || (first !== undefined && hasSelfLoop(first));
}

export interface CycleAnalysis {
  cycles: Cycle[];
  componentCount: number;
}

/**
 * Finds every cyclic strongly connected component: more than one member, or a
 * single file importing itself. Each gets one representative cycle path; a
 * component may contain many more cycles, which are deliberately not enumerated.
 */
export function findCycles(graph: DependencyGraph): CycleAnalysis {
  const n = graph.nodes.length;
  const components = stronglyConnectedComponents(n, (node) => graph.outgoing[node] ?? []);

  // A second pass over runtime-only edges tells which cycles survive type erasure.
  const isRuntime = (from: number, to: number) => graph.edgeBetween(from, to)?.typeOnly === false;
  const runtimeOutgoing = graph.outgoing.map((targets, from) =>
    targets.filter((to) => isRuntime(from, to)),
  );
  const inRuntimeCycle = new Uint8Array(n);
  for (const component of stronglyConnectedComponents(n, (node) => runtimeOutgoing[node] ?? [])) {
    if (isCyclic(component, (node) => isRuntime(node, node))) {
      for (const node of component) inRuntimeCycle[node] = 1;
    }
  }

  const member = new Int32Array(n).fill(-1);
  const cycles: Cycle[] = [];
  for (const [id, component] of components.entries()) {
    if (!isCyclic(component, (node) => graph.edgeBetween(node, node) !== undefined)) continue;
    for (const node of component) member[node] = id;
    const inComponent = (node: number) => member[node] === id;
    const idOf = (node: number) => graph.nodes[node]?.id ?? '';
    cycles.push({
      nodes: component.map(idOf),
      representativePath: representativeCycle(graph, component[0] as number, inComponent).map(idOf),
      edges: component.flatMap((from) =>
        (graph.outgoing[from] ?? [])
          .filter(inComponent)
          .map((to) => graph.edgeBetween(from, to) as GraphEdge),
      ),
      runtime: component.some((node) => inRuntimeCycle[node] === 1),
    });
  }
  return { cycles, componentCount: components.length };
}

/**
 * Shortest cycle through `start` within its component, as [start, ..., start].
 * One BFS from `start`: the first visited node with an edge back to `start`
 * closes a shortest cycle. Cost is linear in the component's size.
 */
function representativeCycle(
  graph: DependencyGraph,
  start: number,
  inComponent: (node: number) => boolean,
): number[] {
  const parent = new Map<number, number>([[start, start]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as number;
    for (const next of graph.outgoing[node] ?? []) {
      if (next === start) {
        const path = [start];
        for (let at = node; at !== start; at = parent.get(at) as number) path.push(at);
        path.push(start);
        return path.reverse();
      }
      if (!inComponent(next) || parent.has(next)) continue;
      parent.set(next, node);
      queue.push(next);
    }
  }
  return [start, start]; // unreachable for a cyclic component
}
