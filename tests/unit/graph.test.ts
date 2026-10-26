import { describe, expect, it } from 'vitest';
import { buildGraph, findCycles, shortestPath, type GraphLink } from '../../src/analysis/graph.js';
import type { GraphNode, ImportReference } from '../../src/analysis/types.js';

const node = (id: string): GraphNode => ({
  id,
  path: id,
  extension: '.ts',
  status: 'parsed',
  tsconfig: null,
});

const ref = (specifier: string, line = 1, typeOnly = false): ImportReference => ({
  specifier,
  kind: 'import',
  typeOnly,
  line,
  column: 1,
});

/** Builds a graph from "a>b" style link strings; a trailing ":type" marks a type-only import. */
function graph(ids: string[], links: string[]) {
  return buildGraph(
    ids.map(node),
    links.map((link, index): GraphLink => {
      const [pair = '', type] = link.split(':');
      const [from = '', to = ''] = pair.split('>');
      return { from, to, reference: ref(`./${to}`, index + 1, type === 'type') };
    }),
  );
}

const ids = (g: ReturnType<typeof graph>, indices: number[] | null) =>
  indices?.map((index) => g.nodes[index]?.id);

describe('buildGraph', () => {
  it('builds an empty graph', () => {
    const g = graph([], []);
    expect(g.edges).toEqual([]);
    expect(findCycles(g)).toEqual({ cycles: [], componentCount: 0 });
  });

  it('builds a single node without edges', () => {
    const g = graph(['a'], []);
    expect(g.nodes.map((n) => n.id)).toEqual(['a']);
    expect(g.outgoing).toEqual([[]]);
  });

  it('creates directed edges with incoming and outgoing adjacency', () => {
    const g = graph(['a', 'b', 'c'], ['a>b', 'c>b']);
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'c>b']);
    expect(g.outgoing).toEqual([[1], [], [1]]);
    expect(g.incoming).toEqual([[], [0, 2], []]);
  });

  it('merges parallel imports into one edge and keeps every reference', () => {
    const g = graph(['a', 'b'], ['a>b', 'a>b']);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]?.references.map((r) => r.line)).toEqual([1, 2]);
  });

  it('marks an edge type-only only when every reference is type-only', () => {
    expect(graph(['a', 'b'], ['a>b:type', 'a>b:type']).edges[0]?.typeOnly).toBe(true);
    expect(graph(['a', 'b'], ['a>b:type', 'a>b']).edges[0]?.typeOnly).toBe(false);
  });

  it('orders edges and adjacency deterministically regardless of input order', () => {
    const forward = graph(['a', 'b', 'c'], ['a>c', 'a>b', 'b>c']);
    const backward = graph(['a', 'b', 'c'], ['b>c', 'a>b', 'a>c']);
    expect(forward.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'a>c', 'b>c']);
    expect(backward.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'a>c', 'b>c']);
    expect(forward.outgoing).toEqual(backward.outgoing);
  });

  it('rejects links to unknown nodes', () => {
    expect(() => graph(['a'], ['a>missing'])).toThrow(/unknown nodes/);
  });
});

describe('shortestPath', () => {
  const g = graph(['a', 'b', 'c', 'd', 'e'], ['a>b', 'b>c', 'c>d', 'a>c', 'e>a']);

  it('finds the path with the fewest edges', () => {
    expect(ids(g, shortestPath(g, 0, 3))).toEqual(['a', 'c', 'd']);
  });

  it('follows edge direction only', () => {
    expect(shortestPath(g, 3, 0)).toBeNull();
    expect(ids(g, shortestPath(g, 4, 3))).toEqual(['e', 'a', 'c', 'd']);
  });

  it('returns a single node for identical endpoints', () => {
    expect(ids(g, shortestPath(g, 1, 1))).toEqual(['b']);
  });

  it('breaks ties by visiting neighbours in ascending order', () => {
    const tie = graph(['a', 'b', 'c', 'd'], ['a>c', 'a>b', 'b>d', 'c>d']);
    expect(ids(tie, shortestPath(tie, 0, 3))).toEqual(['a', 'b', 'd']);
  });
});

describe('findCycles', () => {
  it('reports no cycles for an acyclic graph', () => {
    const result = findCycles(graph(['a', 'b', 'c'], ['a>b', 'b>c', 'a>c']));
    expect(result).toEqual({ cycles: [], componentCount: 3 });
  });

  it('reports a simple cycle with a representative path and its edges', () => {
    const [cycle] = findCycles(graph(['a', 'b', 'c'], ['a>b', 'b>c', 'c>a'])).cycles;
    expect(cycle?.nodes).toEqual(['a', 'b', 'c']);
    expect(cycle?.representativePath).toEqual(['a', 'b', 'c', 'a']);
    expect(cycle?.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'b>c', 'c>a']);
    expect(cycle?.runtime).toBe(true);
  });

  it('reports a self-loop', () => {
    const [cycle] = findCycles(graph(['a', 'b'], ['a>a', 'a>b'])).cycles;
    expect(cycle?.nodes).toEqual(['a']);
    expect(cycle?.representativePath).toEqual(['a', 'a']);
  });

  it('reports disconnected cyclic components separately', () => {
    const result = findCycles(
      graph(['a', 'b', 'c', 'd', 'e'], ['a>b', 'b>a', 'd>e', 'e>d', 'c>a']),
    );
    expect(result.cycles.map((cycle) => cycle.nodes)).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ]);
    expect(result.componentCount).toBe(3);
  });

  it('uses the shortest cycle through the first member as the representative', () => {
    // a>b>c>d>a and a>d>a: both in one component, shortest through a is a>d>a.
    const [cycle] = findCycles(
      graph(['a', 'b', 'c', 'd'], ['a>b', 'b>c', 'c>d', 'd>a', 'a>d']),
    ).cycles;
    expect(cycle?.nodes).toEqual(['a', 'b', 'c', 'd']);
    expect(cycle?.representativePath).toEqual(['a', 'd', 'a']);
    expect(cycle?.edges).toHaveLength(5);
  });

  it('distinguishes type-only cycles from runtime cycles', () => {
    const typeOnly = findCycles(graph(['a', 'b'], ['a>b:type', 'b>a'])).cycles[0];
    expect(typeOnly?.runtime).toBe(false);
    const typeSelfLoop = findCycles(graph(['a'], ['a>a:type'])).cycles[0];
    expect(typeSelfLoop?.runtime).toBe(false);
    // The 3-cycle survives without the type-only edge b>a.
    const mixed = findCycles(graph(['a', 'b', 'c'], ['a>b', 'b>a:type', 'b>c', 'c>a'])).cycles[0];
    expect(mixed?.runtime).toBe(true);
  });

  it('handles a large cyclic graph', () => {
    const n = 50_000;
    const names = Array.from({ length: n }, (_, i) => `f${String(i).padStart(5, '0')}`);
    const links = names.map((name, i) => `${name}>${names[(i + 1) % n] ?? ''}`);
    const [cycle] = findCycles(graph(names, links)).cycles;
    expect(cycle?.nodes).toHaveLength(n);
    expect(cycle?.representativePath).toHaveLength(n + 1);
  });
});
