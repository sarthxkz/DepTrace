import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { ModuleCard } from '../components/ModuleCard';
import {
  CardSection,
  CatalogCard,
  ModuleLink,
  Notice,
  PathChain,
  SeverityBadge,
} from '../components/ui';
import { number, plural } from '../lib/format';
import { href, navigate } from '../lib/router';
import {
  DEFAULT_FILTERS,
  edgeVisible,
  FORCE_LAYOUT_LIMIT,
  groupByFolder,
  groupedPositions,
  highlightFor,
  isDefaultFilters,
  RENDER_LIMIT,
  visibleModules,
  type Focus,
  type GraphFilters,
} from '../model/graph';
import { hasLayers, UNCLASSIFIED, type Model } from '../model/model';
import {
  GraphCanvas,
  type CanvasEdge,
  type CanvasLayout,
  type CanvasNode,
  type ViewportCommand,
  type ViewportRequest,
} from './GraphCanvas';

type Mode = 'neighbours' | 'dependencies' | 'dependents';
const MODES: { value: Mode; label: string }[] = [
  { value: 'neighbours', label: 'Direct' },
  { value: 'dependencies', label: 'Dependencies' },
  { value: 'dependents', label: 'Dependents' },
];
const DEPTHS = [1, 2, 3, Number.POSITIVE_INFINITY];

const nodeSize = (degree: number) => Math.round(Math.min(64, 18 + 7 * Math.sqrt(degree)));
const pkgId = (name: string) => `package:${name}`;
const folderId = (path: string) => `folder:${path}`;

export function GraphView({ model, params }: { model: Model; params: URLSearchParams }) {
  const [filters, setFilters] = useState<GraphFilters>(() => ({
    ...DEFAULT_FILTERS,
    layers: params.get('layer') ? [params.get('layer') ?? ''] : [],
    packageName: params.get('package') ?? '',
  }));
  const [granularity, setGranularity] = useState<'files' | 'folders'>(
    model.modules.length > RENDER_LIMIT.nodes ? 'folders' : 'files',
  );
  const [folderDepth, setFolderDepth] = useState(2);
  const [layout, setLayout] = useState<CanvasLayout>(hasLayers(model) ? 'grouped' : 'hierarchy');
  const [isolate, setIsolate] = useState(false);
  const [renderAll, setRenderAll] = useState(false);
  // A selected edge belongs to the route it was picked on; navigating clears it.
  const [edgeSelection, setEdgeSelection] = useState<{
    edge: number;
    params: URLSearchParams;
  } | null>(null);
  const edge = edgeSelection?.params === params ? edgeSelection.edge : null;
  const setEdge = (index: number | null) => {
    setEdgeSelection(index === null ? null : { edge: index, params });
  };
  const [command, setCommand] = useState<ViewportCommand | null>(null);
  const counter = useRef(0);
  const run = (next: ViewportRequest) => {
    counter.current++;
    setCommand({ ...next, n: counter.current });
  };

  const focusId = params.get('focus');
  const focusModule = focusId === null ? undefined : model.byId.get(focusId);
  const mode = (
    MODES.some((m) => m.value === params.get('mode')) ? params.get('mode') : 'neighbours'
  ) as Mode;
  const depthParam = params.get('depth');
  const depth =
    depthParam === null || depthParam === 'all'
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Number(depthParam) || 1);
  const toModule = params.get('to') === null ? undefined : model.byId.get(params.get('to') ?? '');
  const cycleParam = params.get('cycle');
  const cycle = cycleParam === null ? undefined : Number(cycleParam);
  const finding =
    params.get('finding') === null ? undefined : model.findingById.get(params.get('finding') ?? '');

  const focus: Focus | null = useMemo(() => {
    if (edge !== null) return { kind: 'edge', edge };
    if (focusModule !== undefined && toModule !== undefined)
      return { kind: 'path', from: focusModule, to: toModule };
    if (focusModule !== undefined) return { kind: 'module', module: focusModule, mode, depth };
    if (cycle !== undefined && model.cycles[cycle]) return { kind: 'cycle', cycle };
    if (finding) return { kind: 'finding', finding };
    return null;
  }, [edge, focusModule, toModule, mode, depth, cycle, finding, model]);
  const highlight = useMemo(() => (focus ? highlightFor(model, focus) : null), [model, focus]);

  const filtered = useMemo(() => visibleModules(model, filters), [model, filters]);
  const shown = useMemo(
    () =>
      isolate && highlight ? filtered.filter((index) => highlight.modules.has(index)) : filtered,
    [filtered, isolate, highlight],
  );

  const graph = useMemo(() => {
    const visible = new Set(shown);
    if (granularity === 'folders') {
      const folders = groupByFolder(model, shown, folderDepth, filters);
      const nodes: CanvasNode[] = folders.folders.map((folder) => {
        const severities = folder.modules.flatMap(
          (i) => model.modules[i]?.findings.map((f) => f.severity) ?? [],
        );
        return {
          id: folderId(folder.id),
          label: `${folder.id} (${String(folder.modules.length)})`,
          kind: 'folder',
          slot: commonSlot(model, folder.modules),
          size: nodeSize(folder.modules.length * 2),
          severity: severities.includes('error')
            ? 'error'
            : severities.includes('warning')
              ? 'warning'
              : null,
          title: `${folder.id}: ${plural(folder.modules.length, 'file')}`,
        };
      });
      const edges: CanvasEdge[] = folders.edges.map((e) => ({
        id: `folder-edge:${e.from}\0${e.to}`,
        source: folderId(e.from),
        target: folderId(e.to),
        typeOnly: e.typeOnly,
        cycle: false,
        violation: e.findings > 0,
        external: false,
        label: String(e.count),
      }));
      return { nodes, edges, folders };
    }
    const nodes: CanvasNode[] = shown.map((index) => {
      const module = model.modules[index];
      const severities = module?.findings.map((f) => f.severity) ?? [];
      return {
        id: module?.id ?? String(index),
        label: module?.name ?? '',
        kind: 'module',
        slot: module?.layer ? (model.layerByName.get(module.layer)?.slot ?? null) : null,
        size: nodeSize((module?.incoming.length ?? 0) + (module?.outgoing.length ?? 0)),
        severity: severities.includes('error')
          ? 'error'
          : severities.includes('warning')
            ? 'warning'
            : null,
        title: `${module?.id ?? ''}\n${module?.layer ?? (hasLayers(model) ? 'unclassified' : '')}\nimports ${String(module?.outgoing.length ?? 0)}, imported by ${String(module?.incoming.length ?? 0)}`,
      };
    });
    const edges: CanvasEdge[] = model.edges
      .filter((e) => visible.has(e.from) && visible.has(e.to) && edgeVisible(e, filters))
      .map((e) => ({
        id: `edge:${String(e.index)}`,
        source: model.modules[e.from]?.id ?? '',
        target: model.modules[e.to]?.id ?? '',
        typeOnly: e.typeOnly,
        cycle: e.cycle !== null,
        violation: e.findings.length > 0,
        external: false,
      }));
    if (filters.showPackages) {
      const used = new Set<string>();
      for (const index of shown) {
        for (const name of model.modules[index]?.packages ?? []) {
          used.add(name);
          edges.push({
            id: `package-edge:${String(index)}\0${name}`,
            source: model.modules[index]?.id ?? '',
            target: pkgId(name),
            typeOnly: false,
            cycle: false,
            violation: false,
            external: true,
          });
        }
      }
      for (const pkg of model.packages.filter((p) => used.has(p.name))) {
        nodes.push({
          id: pkgId(pkg.name),
          label: pkg.name,
          kind: 'package',
          slot: null,
          size: nodeSize(pkg.importers.length),
          severity: null,
          title: `${pkg.name}${pkg.builtin ? ' (Node.js built-in)' : ''}: imported by ${plural(pkg.importers.length, 'file')}`,
        });
      }
    }
    return { nodes, edges, folders: null };
  }, [model, shown, granularity, folderDepth, filters]);

  const canvasHighlight = useMemo(() => {
    if (!highlight) return null;
    if (granularity === 'folders' && graph.folders) {
      const nodes = new Set<string>();
      for (const folder of graph.folders.folders) {
        if (folder.modules.some((i) => highlight.modules.has(i))) nodes.add(folderId(folder.id));
      }
      return { nodes, edges: new Set<string>() };
    }
    return {
      nodes: new Set([...highlight.modules].map((i) => model.modules[i]?.id ?? '')),
      edges: new Set([...highlight.edges].map((i) => `edge:${String(i)}`)),
    };
  }, [highlight, granularity, graph, model]);

  const grouped = useMemo(() => {
    if (layout !== 'grouped') return null;
    const order = [...model.layers.map((l) => l.name), UNCLASSIFIED];
    return groupedPositions(
      graph.nodes.map((node) => {
        if (node.kind === 'package') return { id: node.id, group: '~packages' };
        const index = node.kind === 'module' ? model.byId.get(node.id) : undefined;
        const group = hasLayers(model)
          ? node.kind === 'folder'
            ? node.slot === null
              ? UNCLASSIFIED
              : (model.layers[node.slot]?.name ?? UNCLASSIFIED)
            : (model.modules[index ?? -1]?.layer ?? UNCLASSIFIED)
          : node.id
              .replace(/^folder:/, '')
              .split('/')
              .slice(0, 2)
              .join('/');
        return { id: node.id, group };
      }),
      order,
    );
  }, [layout, graph, model]);

  // Band labels name each row of the grouped layout.
  const canvasNodes = useMemo(() => {
    if (!grouped) return graph.nodes;
    const bands: CanvasNode[] = grouped.bands.map((band) => ({
      id: `band:${band.group}`,
      label:
        band.group === UNCLASSIFIED
          ? 'unclassified'
          : band.group === '~packages'
            ? 'external packages'
            : band.group,
      kind: 'band',
      slot: null,
      size: 1,
      severity: null,
      title: '',
    }));
    return [...graph.nodes, ...bands];
  }, [graph, grouped]);
  const positions = useMemo(() => {
    if (!grouped) return null;
    const all = new Map(grouped.positions);
    for (const band of grouped.bands) all.set(`band:${band.group}`, { x: band.x, y: band.y });
    return all;
  }, [grouped]);

  const tooLarge =
    graph.nodes.length > RENDER_LIMIT.nodes || graph.edges.length > RENDER_LIMIT.edges;
  const forceAllowed = graph.nodes.length <= FORCE_LAYOUT_LIMIT;
  const effectiveLayout = layout === 'force' && !forceAllowed ? 'hierarchy' : layout;

  const select = (target: { kind: 'node' | 'edge'; id: string } | null) => {
    if (!target) {
      setEdge(null);
      return;
    }
    if (target.kind === 'edge') {
      const index = target.id.startsWith('edge:') ? Number(target.id.slice(5)) : null;
      setEdge(index);
      return;
    }
    if (target.id.startsWith('band:')) return;
    if (target.id.startsWith('folder:')) {
      setFilters((f) => ({ ...f, directory: target.id.slice('folder:'.length) }));
      setGranularity('files');
      return;
    }
    if (target.id.startsWith('package:')) {
      setFilters((f) => ({
        ...f,
        packageName: target.id.slice('package:'.length),
        showPackages: true,
      }));
      return;
    }
    navigate('graph', { focus: target.id, mode: params.get('mode'), depth: params.get('depth') });
  };

  const clearFocus = () => {
    setEdge(null);
    setIsolate(false);
    navigate('graph');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
    if (event.key === 'Escape') clearFocus();
    if (typing) return;
    if (event.key === '/') {
      event.preventDefault();
      document.getElementById('graph-search')?.focus();
    } else if (event.key === 'f') run({ kind: 'fit' });
    else if (event.key === '+' || event.key === '=') run({ kind: 'zoomIn' });
    else if (event.key === '-') run({ kind: 'zoomOut' });
  };

  const hiddenFocus = focusModule !== undefined && !shown.includes(focusModule);

  return (
    <div className="page graph-page" onKeyDown={onKeyDown}>
      <div className="graph-toolbar">
        <h1>Dependency graph</h1>
        <ModuleSearch
          model={model}
          onPick={(id) => {
            navigate('graph', { focus: id });
          }}
        />
        <div className="segmented" role="group" aria-label="Show">
          <button
            type="button"
            aria-pressed={granularity === 'files'}
            onClick={() => {
              setGranularity('files');
            }}
          >
            Files
          </button>
          <button
            type="button"
            aria-pressed={granularity === 'folders'}
            onClick={() => {
              setGranularity('folders');
            }}
          >
            Folders
          </button>
        </div>
        {granularity === 'folders' && (
          <label className="field inline">
            <span>Folder depth</span>
            <select
              value={folderDepth}
              onChange={(e) => {
                setFolderDepth(Number(e.target.value));
              }}
            >
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field inline">
          <span>Layout</span>
          <select
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value as CanvasLayout);
            }}
          >
            <option value="grouped">{hasLayers(model) ? 'By layer' : 'By folder'}</option>
            <option value="hierarchy">Hierarchy</option>
            <option value="force" disabled={!forceAllowed}>
              Force{forceAllowed ? '' : ` (up to ${String(FORCE_LAYOUT_LIMIT)} nodes)`}
            </option>
          </select>
        </label>
        <div className="toolbar-buttons" role="group" aria-label="Viewport">
          <button
            type="button"
            className="button icon-only"
            onClick={() => {
              run({ kind: 'zoomIn' });
            }}
            title="Zoom in (+)"
          >
            <Icon name="plus" label="Zoom in" />
          </button>
          <button
            type="button"
            className="button icon-only"
            onClick={() => {
              run({ kind: 'zoomOut' });
            }}
            title="Zoom out (-)"
          >
            <Icon name="minus" label="Zoom out" />
          </button>
          <button
            type="button"
            className="button icon-only"
            onClick={() => {
              run({ kind: 'fit' });
            }}
            title="Fit to screen (F)"
          >
            <Icon name="fit" label="Fit to screen" />
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              clearFocus();
              run({ kind: 'fit' });
            }}
            title="Clear the selection and fit the whole graph (Esc)"
          >
            <Icon name="reset" /> Reset view
          </button>
        </div>
      </div>

      <div className="graph-body">
        <section className="graph-stage" aria-label="Graph">
          <FilterPanel model={model} filters={filters} onChange={setFilters} />
          <p className="graph-status" role="status">
            Showing {plural(graph.nodes.length, granularity === 'folders' ? 'folder' : 'node')} and{' '}
            {plural(graph.edges.length, 'dependency', 'dependencies')}
            {granularity === 'files' &&
              ` (${number(shown.length)} of ${number(model.modules.length)} files)`}
            {!isDefaultFilters(filters) && ' · filters active'}
            {isolate && ' · isolated'}
          </p>
          {hiddenFocus && (
            <Notice>
              The selected file is hidden by the filters.{' '}
              <button
                type="button"
                className="button small"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                }}
              >
                Reset filters
              </button>
            </Notice>
          )}
          {highlight && !highlight.found && (
            <Notice tone="warning">
              No import path leads from <code>{model.modules[focusModule ?? -1]?.id}</code> to{' '}
              <code>{model.modules[toModule ?? -1]?.id}</code>.
            </Notice>
          )}
          {graph.nodes.length === 0 ? (
            <div className="graph-empty">
              <p>No {granularity === 'folders' ? 'folders' : 'files'} match the filters.</p>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setIsolate(false);
                }}
              >
                <Icon name="reset" /> Reset filters
              </button>
            </div>
          ) : tooLarge && !renderAll ? (
            <div className="graph-limit" role="alert">
              <h2>This view is too large to draw at once</h2>
              <p>
                It has {plural(graph.nodes.length, 'node')} and{' '}
                {plural(graph.edges.length, 'dependency', 'dependencies')}; the limit is{' '}
                {number(RENDER_LIMIT.nodes)} nodes and {number(RENDER_LIMIT.edges)} dependencies.
                Nothing has been left out: choose a smaller view.
              </p>
              <div className="button-row">
                {granularity === 'files' && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setGranularity('folders');
                    }}
                  >
                    Group by folder
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  onClick={() => document.getElementById('graph-search')?.focus()}
                >
                  <Icon name="search" /> Search a file
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setRenderAll(true);
                  }}
                >
                  Draw all {number(graph.nodes.length)} anyway (slow)
                </button>
              </div>
            </div>
          ) : (
            <GraphCanvas
              nodes={canvasNodes}
              edges={graph.edges}
              layout={effectiveLayout}
              positions={positions}
              highlight={canvasHighlight}
              selected={focusModule !== undefined ? (model.modules[focusModule]?.id ?? null) : null}
              command={command}
              onSelect={select}
              label={`Dependency graph: ${plural(graph.nodes.length, 'node')}, ${plural(graph.edges.length, 'dependency', 'dependencies')}. Use the search field or the Modules page to explore it with the keyboard.`}
            />
          )}
          <Legend model={model} granularity={granularity} />
        </section>

        <aside className="graph-side" aria-label="Selection">
          <FocusPanel
            model={model}
            focus={focus}
            params={params}
            isolate={isolate}
            onIsolate={setIsolate}
            onCenter={(id) => {
              run({ kind: 'center', id });
            }}
            onClear={clearFocus}
          />
        </aside>
      </div>
    </div>
  );
}

function commonSlot(model: Model, modules: number[]): number | null {
  const layers = new Set(modules.map((i) => model.modules[i]?.layer ?? null));
  if (layers.size !== 1) return null;
  const [layer] = layers;
  return layer ? (model.layerByName.get(layer)?.slot ?? null) : null;
}

function ModuleSearch({ model, onPick }: { model: Model; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q === '' ? [] : model.modules.filter((m) => m.id.toLowerCase().includes(q)).slice(0, 8)),
    [model, q],
  );
  const pick = (id: string) => {
    onPick(id);
    setQuery('');
  };
  return (
    <div className="search-box">
      <label className="visually-hidden" htmlFor="graph-search">
        Find a file in the graph
      </label>
      <Icon name="search" />
      <input
        id="graph-search"
        type="search"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="graph-search-results"
        aria-activedescendant={matches[active] ? `graph-search-${String(active)}` : undefined}
        aria-autocomplete="list"
        placeholder="Find a file (/)"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (event.key === 'Enter' && matches[active]) {
            event.preventDefault();
            pick(matches[active].id);
          }
        }}
      />
      {q !== '' && (
        <ul id="graph-search-results" role="listbox" className="search-results">
          {matches.length === 0 ? (
            <li className="muted" role="option" aria-selected="false" aria-disabled="true">
              No file matches “{query}”
            </li>
          ) : (
            matches.map((m, index) => (
              <li
                key={m.id}
                id={`graph-search-${String(index)}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'active' : undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(m.id);
                }}
              >
                <span className="mono">{m.id}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function FilterPanel({
  model,
  filters,
  onChange,
}: {
  model: Model;
  filters: GraphFilters;
  onChange: (filters: GraphFilters) => void;
}) {
  const set = (patch: Partial<GraphFilters>) => {
    onChange({ ...filters, ...patch });
  };
  const kinds = useMemo(() => [...new Set(model.edges.flatMap((e) => e.kinds))].sort(), [model]);
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return (
    <details className="filter-panel">
      <summary>Filters{!isDefaultFilters(filters) && <span className="count">on</span>}</summary>
      <div className="filter-body">
        <label className="field">
          <span>Folder</span>
          <input
            type="search"
            value={filters.directory}
            placeholder="e.g. src/domain"
            onChange={(e) => {
              set({ directory: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span>Path contains</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => {
              set({ query: e.target.value });
            }}
          />
        </label>
        {hasLayers(model) && (
          <fieldset>
            <legend>Layers</legend>
            {[
              ...model.layers.map((l) => ({ name: l.name, slot: l.slot })),
              { name: UNCLASSIFIED, slot: null },
            ].map((layer) => (
              <label key={layer.name} className="check">
                <input
                  type="checkbox"
                  checked={filters.layers.length === 0 || filters.layers.includes(layer.name)}
                  onChange={() => {
                    const all = [...model.layers.map((l) => l.name), UNCLASSIFIED];
                    const current = filters.layers.length === 0 ? all : filters.layers;
                    const next = toggle(current, layer.name);
                    set({ layers: next.length === all.length ? [] : next });
                  }}
                />
                <span className="swatch" data-slot={layer.slot ?? 'none'} aria-hidden="true" />
                {layer.name === UNCLASSIFIED ? 'unclassified' : layer.name}
              </label>
            ))}
          </fieldset>
        )}
        {model.packages.length > 0 && (
          <label className="field">
            <span>Importing package</span>
            <select
              value={filters.packageName}
              onChange={(e) => {
                set({ packageName: e.target.value });
              }}
            >
              <option value="">Any</option>
              {model.packages.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset>
          <legend>Import kinds</legend>
          {kinds.map((kind) => (
            <label key={kind} className="check">
              <input
                type="checkbox"
                checked={filters.kinds.length === 0 || filters.kinds.includes(kind)}
                onChange={() => {
                  const current = filters.kinds.length === 0 ? kinds : filters.kinds;
                  const next = toggle(current, kind);
                  set({ kinds: next.length === kinds.length ? [] : next });
                }}
              />
              <code>{kind}</code>
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={filters.includeTypeOnly}
              onChange={() => {
                set({ includeTypeOnly: !filters.includeTypeOnly });
              }}
            />
            Type-only imports
          </label>
        </fieldset>
        <fieldset>
          <legend>Show</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.onlyViolations}
              onChange={() => {
                set({ onlyViolations: !filters.onlyViolations });
              }}
            />
            Only files in violations
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.onlyCycles}
              onChange={() => {
                set({ onlyCycles: !filters.onlyCycles });
              }}
            />
            Only files in cycles
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.showPackages}
              onChange={() => {
                set({ showPackages: !filters.showPackages });
              }}
            />
            External packages
          </label>
        </fieldset>
        <button
          type="button"
          className="button"
          disabled={isDefaultFilters(filters)}
          onClick={() => {
            onChange(DEFAULT_FILTERS);
          }}
        >
          <Icon name="reset" /> Reset filters
        </button>
      </div>
    </details>
  );
}

function Legend({ model, granularity }: { model: Model; granularity: 'files' | 'folders' }) {
  return (
    <details className="legend">
      <summary>Legend</summary>
      <ul>
        {model.layers.map((layer) => (
          <li key={layer.name}>
            <span className="swatch" data-slot={layer.slot ?? 'none'} aria-hidden="true" />{' '}
            {layer.name}
          </li>
        ))}
        <li>
          <span className="swatch" data-slot="none" aria-hidden="true" />{' '}
          {hasLayers(model) ? 'unclassified' : 'file (no layers configured)'}
        </li>
        <li>
          <span className="legend-node ring-error" aria-hidden="true" /> source of an error
          violation
        </li>
        <li>
          <span className="legend-node ring-warning" aria-hidden="true" /> source of a warning
          violation
        </li>
        <li>
          <span className="legend-line" aria-hidden="true" /> import (arrow points to the imported
          file)
        </li>
        <li>
          <span className="legend-line dashed" aria-hidden="true" /> type-only import
        </li>
        <li>
          <span className="legend-line violation" aria-hidden="true" /> causes a violation
        </li>
        <li>
          <span className="legend-line cycle" aria-hidden="true" /> inside a cycle
        </li>
        <li>
          <span className="legend-line dotted" aria-hidden="true" /> external package
        </li>
        <li>
          Node size:{' '}
          {granularity === 'files' ? 'direct imports plus importers' : 'files in the folder'} (not
          complexity)
        </li>
      </ul>
    </details>
  );
}

function FocusPanel({
  model,
  focus,
  params,
  isolate,
  onIsolate,
  onCenter,
  onClear,
}: {
  model: Model;
  focus: Focus | null;
  params: URLSearchParams;
  isolate: boolean;
  onIsolate: (value: boolean) => void;
  onCenter: (id: string) => void;
  onClear: () => void;
}) {
  if (!focus) {
    return (
      <div className="focus-hint">
        <h2>Pull a card</h2>
        <p>
          Select a file in the graph or search for one to see what it imports and what imports it.
        </p>
        <ul className="key-list">
          <li>
            <kbd>/</kbd> search
          </li>
          <li>
            <kbd>F</kbd> fit
          </li>
          <li>
            <kbd>+</kbd> <kbd>-</kbd> zoom
          </li>
          <li>
            <kbd>Esc</kbd> clear the selection
          </li>
        </ul>
      </div>
    );
  }
  const controls = (
    <div className="focus-controls">
      <label className="check">
        <input
          type="checkbox"
          checked={isolate}
          onChange={() => {
            onIsolate(!isolate);
          }}
        />
        Isolate: hide everything else
      </label>
      <button type="button" className="button ghost small" onClick={onClear}>
        <Icon name="close" /> Clear selection
      </button>
    </div>
  );

  if (focus.kind === 'module' || focus.kind === 'path') {
    const index = focus.kind === 'module' ? focus.module : focus.from;
    const id = model.modules[index]?.id ?? '';
    const current = params.get('mode') ?? 'neighbours';
    const depth = params.get('depth') ?? 'all';
    return (
      <div className="focus-panel">
        <div className="focus-modes" role="group" aria-label="Highlight">
          {MODES.map((m) => (
            <a
              key={m.value}
              className="button small"
              aria-pressed={focus.kind === 'module' && current === m.value}
              href={href('graph', {
                focus: id,
                mode: m.value,
                depth: m.value === 'neighbours' ? null : depth,
              })}
            >
              {m.label}
            </a>
          ))}
        </div>
        {focus.kind === 'module' && focus.mode !== 'neighbours' && (
          <div className="depth-control" role="group" aria-label="Depth">
            <span>Depth</span>
            {DEPTHS.map((d) => {
              const value = Number.isFinite(d) ? String(d) : 'all';
              return (
                <a
                  key={value}
                  className="button small"
                  aria-pressed={depth === value}
                  href={href('graph', { focus: id, mode: current, depth: value })}
                >
                  {Number.isFinite(d) ? d : 'all'}
                </a>
              );
            })}
          </div>
        )}
        <PathTarget
          key={`${id}->${focus.kind === 'path' ? String(focus.to) : ''}`}
          model={model}
          from={id}
          to={focus.kind === 'path' ? (model.modules[focus.to]?.id ?? '') : ''}
        />
        {controls}
        <button
          type="button"
          className="button small"
          onClick={() => {
            onCenter(id);
          }}
        >
          <Icon name="focus" /> Center on this file
        </button>
        <ModuleCard model={model} index={index} />
      </div>
    );
  }
  if (focus.kind === 'cycle') {
    const cycle = model.cycles[focus.cycle];
    if (!cycle) return null;
    return (
      <div className="focus-panel">
        {controls}
        <CatalogCard
          label={`Cycle ${String(focus.cycle + 1)}`}
          title={`Cycle ${String(focus.cycle + 1)}`}
          meta={
            <span className="tag">
              {plural(cycle.nodes.length, 'file')}, {cycle.runtime ? 'runtime' : 'type-only'}
            </span>
          }
          actions={
            <a className="button small" href={href('cycles', { cycle: focus.cycle })}>
              Cycle details
            </a>
          }
        >
          <CardSection title="Representative path">
            <PathChain ids={cycle.representativePath} closed />
          </CardSection>
        </CatalogCard>
      </div>
    );
  }
  if (focus.kind === 'finding') {
    const { finding } = focus;
    return (
      <div className="focus-panel">
        {controls}
        <CatalogCard
          label={`Violation of ${finding.ruleId}`}
          title={<code>{finding.ruleId}</code>}
          meta={<SeverityBadge severity={finding.severity} />}
          actions={
            <a className="button small" href={href('violations', { finding: finding.id })}>
              Violation details
            </a>
          }
        >
          <CardSection title="What it breaks">
            <p>{finding.message}</p>
          </CardSection>
          {finding.path && (
            <CardSection title="Dependency path">
              <PathChain ids={finding.path} closed={finding.target?.kind === 'cycle'} />
            </CardSection>
          )}
        </CatalogCard>
      </div>
    );
  }
  const edge = model.edges[focus.edge];
  if (!edge) return null;
  return (
    <div className="focus-panel">
      {controls}
      <CatalogCard
        label="Selected dependency"
        title="Dependency"
        meta={edge.typeOnly ? <span className="tag">type-only</span> : undefined}
      >
        <CardSection title="Between">
          <p>
            <ModuleLink id={model.modules[edge.from]?.id ?? ''} />{' '}
            <span className="chain-step">imports</span>{' '}
            <ModuleLink id={model.modules[edge.to]?.id ?? ''} />
          </p>
        </CardSection>
        <CardSection title="Import statements" count={edge.references.length}>
          <ul className="ref-list">
            {edge.references.map((ref, i) => (
              <li key={i}>
                <code>{ref.specifier}</code>
                <span className="tag">{ref.kind}</span>
                {ref.typeOnly && <span className="tag">type-only</span>}
                <span className="ref">
                  {ref.line}:{ref.column}
                </span>
              </li>
            ))}
          </ul>
        </CardSection>
        {edge.findings.length > 0 && (
          <CardSection title="Violations" count={edge.findings.length}>
            <ul className="ref-list">
              {edge.findings.map((id) => (
                <li key={id}>
                  <a href={href('violations', { finding: id })}>
                    <code>{model.findingById.get(id)?.ruleId ?? id}</code>
                  </a>
                </li>
              ))}
            </ul>
          </CardSection>
        )}
      </CatalogCard>
    </div>
  );
}

function PathTarget({ model, from, to }: { model: Model; from: string; to: string }) {
  const [value, setValue] = useState(to);
  const listId = 'path-target-options';
  const known = model.byId.has(value);
  const q = value.trim().toLowerCase();
  // Suggestions only; any analyzed path can be typed.
  const suggestions =
    q === '' || known
      ? []
      : model.modules.filter((m) => m.id.toLowerCase().includes(q)).slice(0, 50);
  return (
    <form
      className="path-target"
      onSubmit={(event) => {
        event.preventDefault();
        if (known) navigate('graph', { focus: from, to: value });
      }}
    >
      <label className="field">
        <span>Path to file</span>
        <input
          list={listId}
          value={value}
          placeholder="Shortest import path to…"
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      </label>
      <datalist id={listId}>
        {suggestions.map((m) => (
          <option key={m.id} value={m.id} />
        ))}
      </datalist>
      <button type="submit" className="button small" disabled={!known}>
        Show path
      </button>
      {to !== '' && (
        <a className="button ghost small" href={href('graph', { focus: from })}>
          Clear path
        </a>
      )}
    </form>
  );
}
