/**
 * Tarjan's strongly connected components algorithm, O(V + E), implemented
 * iteratively so deep dependency chains cannot overflow the call stack.
 *
 * Nodes are the integers 0..n-1. Returns components with members in ascending
 * order, sorted by their smallest member, so results are deterministic.
 */
export function stronglyConnectedComponents(
  n: number,
  neighbors: (node: number) => readonly number[],
): number[][] {
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const components: number[][] = [];
  // Explicit DFS frames: node and the position of the next neighbour to visit.
  const frameNode: number[] = [];
  const framePos: number[] = [];
  let counter = 0;

  const enter = (node: number) => {
    index[node] = low[node] = counter++;
    stack.push(node);
    onStack[node] = 1;
    frameNode.push(node);
    framePos.push(0);
  };

  for (let start = 0; start < n; start++) {
    if (index[start] !== -1) continue;
    enter(start);
    while (frameNode.length > 0) {
      const top = frameNode.length - 1;
      const node = frameNode[top] as number;
      const edges = neighbors(node);
      const pos = framePos[top] as number;
      if (pos < edges.length) {
        framePos[top] = pos + 1;
        const next = edges[pos] as number;
        if (index[next] === -1) enter(next);
        else if (onStack[next]) low[node] = Math.min(low[node] as number, index[next] as number);
        continue;
      }
      frameNode.pop();
      framePos.pop();
      if (frameNode.length > 0) {
        const parent = frameNode[frameNode.length - 1] as number;
        low[parent] = Math.min(low[parent] as number, low[node] as number);
      }
      if (low[node] === index[node]) {
        const component: number[] = [];
        let member: number;
        do {
          member = stack.pop() as number;
          onStack[member] = 0;
          component.push(member);
        } while (member !== node);
        components.push(component.sort((a, b) => a - b));
      }
    }
  }
  return components.sort((a, b) => (a[0] as number) - (b[0] as number));
}
