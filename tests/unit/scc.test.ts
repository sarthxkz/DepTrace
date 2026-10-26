import { describe, expect, it } from 'vitest';
import { stronglyConnectedComponents } from '../../src/analysis/scc.js';

const sccOf = (adjacency: number[][]) =>
  stronglyConnectedComponents(adjacency.length, (node) => adjacency[node] ?? []);

/** Deterministic pseudo-random numbers (mulberry32). */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reference implementation: u and v share a component iff each reaches the other. */
function bruteForce(adjacency: number[][]): number[][] {
  const n = adjacency.length;
  const reach = adjacency.map((_, start) => {
    const seen = new Set([start]);
    const queue = [start];
    for (const node of queue) {
      for (const next of adjacency[node] ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  });
  const assigned = new Set<number>();
  const components: number[][] = [];
  for (let u = 0; u < n; u++) {
    if (assigned.has(u)) continue;
    const component = [];
    for (let v = 0; v < n; v++) {
      if (reach[u]?.has(v) && reach[v]?.has(u)) {
        component.push(v);
        assigned.add(v);
      }
    }
    components.push(component);
  }
  return components;
}

describe('stronglyConnectedComponents', () => {
  it('handles an empty graph', () => {
    expect(sccOf([])).toEqual([]);
  });

  it('puts every node of an acyclic graph in its own component', () => {
    expect(sccOf([[1], [2], []])).toEqual([[0], [1], [2]]);
  });

  it('finds a simple cycle', () => {
    expect(sccOf([[1], [2], [0]])).toEqual([[0, 1, 2]]);
  });

  it('keeps a self-loop as a single-node component', () => {
    expect(sccOf([[0], []])).toEqual([[0], [1]]);
  });

  it('separates multiple and disconnected cycles', () => {
    // 0<->1, 2 -> 0, 3<->4<->5, 6 isolated
    expect(sccOf([[1], [0], [0], [4], [5], [3], []])).toEqual([[0, 1], [2], [3, 4, 5], [6]]);
  });

  it('matches a brute-force reference on random graphs', () => {
    const next = random(42);
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(next() * 12);
      const density = next() * 0.4;
      const adjacency = Array.from({ length: n }, () =>
        Array.from({ length: n }, (_, to) => to).filter(() => next() < density),
      );
      expect(sccOf(adjacency)).toEqual(bruteForce(adjacency));
    }
  });

  it('handles a 200 000-node cycle without overflowing the stack', () => {
    const n = 200_000;
    const adjacency = Array.from({ length: n }, (_, node) => [(node + 1) % n]);
    const components = sccOf(adjacency);
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(n);
  });

  it('handles a 200 000-node chain as singleton components', () => {
    const n = 200_000;
    const adjacency = Array.from({ length: n }, (_, node) => (node + 1 < n ? [node + 1] : []));
    expect(sccOf(adjacency)).toHaveLength(n);
  });
});
