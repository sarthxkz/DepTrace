import { describe, expect, it } from 'vitest';
import { parseValue } from '../src/contract/load';
import {
  DEFAULT_FILTERS,
  edgeVisible,
  folderOf,
  groupByFolder,
  groupedPositions,
  highlightFor,
  reach,
  RENDER_LIMIT,
  shortestPath,
  visibleModules,
} from '../src/model/graph';
import { buildModel, UNCLASSIFIED, type Model } from '../src/model/model';
import { defined, fixture, syntheticReport } from './helpers';

function load(value: unknown = fixture('storefront-report.json')): Model {
  const loaded = parseValue(value);
  if (loaded.kind !== 'report') throw new Error('not a report');
  return buildModel(loaded.report, loaded.findings);
}

const model = load();
const at = (id: string) => defined(model.byId.get(id));
const ids = (indices: Iterable<number>) => [...indices].map((i) => model.modules[i]?.id).sort();

describe('buildModel', () => {
  it('takes layer membership from the report, never from guesses', () => {
    expect(model.modules[at('src/domain/pricing.ts')]?.layer).toBe('domain');
    expect(ids(model.unclassified)).toEqual(['src/main.ts', 'src/testing/fake-store.ts']);
    expect(model.layers.map((l) => [l.name, l.slot, l.modules.length])).toEqual([
      ['ui', 0, 4],
      ['application', 1, 4],
      ['domain', 2, 7],
      ['infrastructure', 3, 3],
      ['shared', 4, 3],
    ]);
  });

  it('indexes both directions, cycles, packages and unresolved imports', () => {
    const cart = defined(model.modules[at('src/application/cart-service.ts')]);
    expect(cart.outgoing).toHaveLength(2);
    expect(cart.incoming).toHaveLength(3);
    expect(cart.cycle).toBe(0);
    expect(model.modules[at('src/domain/pricing.ts')]?.packages).toEqual(['fs']);
    expect(
      model.modules[at('src/infrastructure/http/server.ts')]?.unresolved.map((u) => u.specifier),
    ).toEqual(['../../config/env']);
  });

  it('attaches findings to their source, target and causing edge', () => {
    const product = defined(model.modules[at('src/ui/product-list.ts')]);
    expect(product.findings.map((f) => f.ruleId)).toEqual(['layer-boundaries']);
    const client = defined(model.modules[at('src/infrastructure/db/client.ts')]);
    expect(client.involvedIn).toHaveLength(2);
    const edge = defined(
      model.edges[
        defined(
          model.edgeIndex.get(
            `${String(at('src/ui/product-list.ts'))}:${String(at('src/infrastructure/db/client.ts'))}`,
          ),
        )
      ],
    );
    expect(edge.findings).toEqual([defined(product.findings[0]).id]);
    // Every edge inside the reported runtime cycle carries the cycle violation.
    const cycleFinding = defined(model.findings.find((f) => f.target?.kind === 'cycle'));
    expect(model.edges.filter((e) => e.findings.includes(cycleFinding.id))).toHaveLength(3);
  });
});

describe('traversal', () => {
  it('finds transitive dependencies and dependents with depths', () => {
    const deps = reach(model, [at('src/ui/app.ts')], 'out');
    expect(deps.get(at('src/ui/cart-view.ts'))).toBe(1);
    expect(deps.get(at('src/shared/money.ts'))).toBe(3);
    expect(reach(model, [at('src/ui/app.ts')], 'out', 1).size).toBe(2);
    expect(ids(reach(model, [at('src/shared/ids.ts')], 'in').keys())).toEqual([]);
  });

  it('finds one shortest path, or none', () => {
    expect(
      ids(defined(shortestPath(model, at('src/ui/cart-view.ts'), at('src/domain/order.ts')))),
    ).toEqual([
      'src/application/cart-service.ts',
      'src/application/checkout.ts',
      'src/domain/order.ts',
      'src/ui/cart-view.ts',
    ]);
    expect(shortestPath(model, at('src/shared/money.ts'), at('src/main.ts'))).toBeNull();
    expect(shortestPath(model, at('src/main.ts'), at('src/main.ts'))).toEqual([at('src/main.ts')]);
  });
});

describe('filters', () => {
  it('filters by layer (including unclassified), folder, package, query', () => {
    expect(visibleModules(model, { ...DEFAULT_FILTERS, layers: ['shared'] })).toHaveLength(3);
    expect(ids(visibleModules(model, { ...DEFAULT_FILTERS, layers: [UNCLASSIFIED] }))).toEqual([
      'src/main.ts',
      'src/testing/fake-store.ts',
    ]);
    expect(
      visibleModules(model, { ...DEFAULT_FILTERS, directory: 'src/infrastructure/' }),
    ).toHaveLength(3);
    // A folder prefix does not match sibling names that merely start the same way.
    expect(visibleModules(model, { ...DEFAULT_FILTERS, directory: 'src/infra' })).toHaveLength(0);
    expect(ids(visibleModules(model, { ...DEFAULT_FILTERS, packageName: 'pg' }))).toEqual([
      'src/infrastructure/db/client.ts',
      'src/infrastructure/http/server.ts',
    ]);
    expect(visibleModules(model, { ...DEFAULT_FILTERS, query: 'PRICING' })).toEqual([
      at('src/domain/pricing.ts'),
    ]);
  });

  it('filters to files in violations or cycles', () => {
    expect(visibleModules(model, { ...DEFAULT_FILTERS, onlyCycles: true })).toHaveLength(5);
    const violating = ids(visibleModules(model, { ...DEFAULT_FILTERS, onlyViolations: true }));
    expect(violating).toContain('src/infrastructure/db/client.ts'); // a target counts too
    expect(violating).not.toContain('src/shared/ids.ts');
  });

  it('hides edges by import kind and type-only imports', () => {
    const typeOnly = defined(model.edges.find((e) => e.typeOnly));
    expect(edgeVisible(typeOnly, DEFAULT_FILTERS)).toBe(true);
    expect(edgeVisible(typeOnly, { ...DEFAULT_FILTERS, includeTypeOnly: false })).toBe(false);
    expect(edgeVisible(typeOnly, { ...DEFAULT_FILTERS, kinds: ['require'] })).toBe(false);
  });
});

describe('highlight', () => {
  it('lights direct neighbours, or one direction to a depth', () => {
    const app = at('src/ui/app.ts');
    const direct = highlightFor(model, {
      kind: 'module',
      module: app,
      mode: 'neighbours',
      depth: 1,
    });
    expect(ids(direct.modules)).toEqual([
      'src/main.ts',
      'src/ui/app.ts',
      'src/ui/cart-view.ts',
      'src/ui/product-list.ts',
    ]);
    const two = highlightFor(model, {
      kind: 'module',
      module: app,
      mode: 'dependencies',
      depth: 2,
    });
    expect(two.modules.has(at('src/application/cart-service.ts'))).toBe(true);
    expect(two.modules.has(at('src/main.ts'))).toBe(false);
    expect(two.edges.size).toBeGreaterThan(0);
  });

  it('lights a path, and says when none exists', () => {
    const path = highlightFor(model, {
      kind: 'path',
      from: at('src/ui/cart-view.ts'),
      to: at('src/domain/order.ts'),
    });
    expect(path.found).toBe(true);
    expect(path.edges.size).toBe(3);
    const none = highlightFor(model, {
      kind: 'path',
      from: at('src/shared/money.ts'),
      to: at('src/main.ts'),
    });
    expect(none.found).toBe(false);
  });

  it('lights a cycle and a violation', () => {
    const cycle = highlightFor(model, { kind: 'cycle', cycle: 0 });
    expect(cycle.modules.size).toBe(3);
    expect(cycle.edges.size).toBe(3);
    const finding = defined(model.findings.find((f) => f.file === 'src/ui/product-list.ts'));
    const lit = highlightFor(model, { kind: 'finding', finding });
    expect(ids(lit.modules)).toEqual(['src/infrastructure/db/client.ts', 'src/ui/product-list.ts']);
    expect(lit.edges.size).toBe(1);
  });
});

describe('grouping and layout', () => {
  it('groups files into folders without losing edges', () => {
    expect(folderOf('src/domain/model/order.ts', 2)).toBe('src/domain');
    expect(folderOf('index.ts', 2)).toBe('.');
    const all = model.modules.map((m) => m.index);
    const folders = groupByFolder(model, all, 2, DEFAULT_FILTERS);
    expect(folders.folders.reduce((sum, f) => sum + f.modules.length, 0)).toBe(23);
    const crossFolder = model.edges.filter(
      (e) =>
        folderOf(model.modules[e.from]?.id ?? '', 2) !== folderOf(model.modules[e.to]?.id ?? '', 2),
    ).length;
    expect(folders.edges.reduce((sum, e) => sum + e.count, 0)).toBe(crossFolder);
  });

  it('lays out groups deterministically, one band per group in order', () => {
    const input = [
      { id: 'b', group: 'domain' },
      { id: 'a', group: 'ui' },
      { id: 'c', group: 'domain' },
    ];
    const first = groupedPositions(input, ['ui', 'domain']);
    expect(first).toEqual(groupedPositions([...input].reverse(), ['ui', 'domain']));
    expect(first.bands.map((b) => b.group)).toEqual(['ui', 'domain']);
    expect(defined(first.positions.get('a')).y).toBeLessThan(defined(first.positions.get('b')).y);
  });
});

describe('large graphs', () => {
  it('indexes, filters and groups 20 000 files quickly', () => {
    const started = performance.now();
    const big = load(syntheticReport(20_000, 120));
    const visible = visibleModules(big, DEFAULT_FILTERS);
    const folders = groupByFolder(big, visible, 2, DEFAULT_FILTERS);
    const elapsed = performance.now() - started;
    expect(visible.length).toBeGreaterThan(RENDER_LIMIT.nodes);
    expect(folders.folders).toHaveLength(120);
    expect(folders.folders.length).toBeLessThan(RENDER_LIMIT.nodes);
    // Generous bound for slow CI machines; locally this takes well under a second.
    expect(elapsed).toBeLessThan(10_000);
  });
});
