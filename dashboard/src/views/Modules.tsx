import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { LayerTag, ModuleCard } from '../components/ModuleCard';
import { EmptyState, Pager } from '../components/ui';
import { plural } from '../lib/format';
import { href, navigate } from '../lib/router';
import { hasLayers, UNCLASSIFIED, type Model, type ModuleInfo } from '../model/model';

const PAGE_SIZE = 100;

type SortKey = 'path' | 'layer' | 'imports' | 'importedBy' | 'packages' | 'violations';

const SHOW = {
  all: 'All files',
  violations: 'With violations',
  cycles: 'In a cycle',
  unresolved: 'With unresolved imports',
  problems: 'With parse problems',
  isolated: 'Without internal imports or importers',
} as const;
type Show = keyof typeof SHOW;

const value = (module: ModuleInfo, key: SortKey): number | string => {
  switch (key) {
    case 'path':
      return module.id;
    case 'layer':
      return module.layer ?? '￿';
    case 'imports':
      return module.outgoing.length;
    case 'importedBy':
      return module.incoming.length;
    case 'packages':
      return module.packages.length;
    case 'violations':
      return module.findings.length + module.involvedIn.length;
  }
};

export function Modules({ model, params }: { model: Model; params: URLSearchParams }) {
  const selected = model.byId.get(params.get('file') ?? '');
  const showParam = params.get('show');
  const [query, setQuery] = useState('');
  const [layer, setLayer] = useState(params.get('layer') ?? '');
  const [show, setShow] = useState<Show>(
    showParam !== null && showParam in SHOW ? (showParam as Show) : 'all',
  );
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'path',
    descending: false,
  });
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = model.modules.filter(
      (m) =>
        (q === '' || m.id.toLowerCase().includes(q)) &&
        (layer === '' || (m.layer ?? UNCLASSIFIED) === layer) &&
        (show === 'all' ||
          (show === 'violations' && m.findings.length + m.involvedIn.length > 0) ||
          (show === 'cycles' && m.cycle !== null) ||
          (show === 'unresolved' && m.unresolved.length > 0) ||
          (show === 'problems' && m.status !== 'parsed') ||
          (show === 'isolated' && m.incoming.length + m.outgoing.length === 0)),
    );
    const direction = sort.descending ? -1 : 1;
    return filtered.sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1) * direction;
    });
  }, [model, query, layer, show, sort]);

  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const header = (key: SortKey, label: string, numeric = false) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
        className={numeric ? 'numeric' : undefined}
      >
        <button
          type="button"
          className="sort-button"
          onClick={() => {
            setSort({ key, descending: active ? !sort.descending : numeric });
            setPage(0);
          }}
        >
          {label}
          {active && <Icon name={sort.descending ? 'chevronDown' : 'chevronUp'} size={14} />}
        </button>
      </th>
    );
  };

  return (
    <div className={`page split${selected !== undefined ? ' has-detail' : ''}`}>
      <div className="split-main">
        <h1>Modules</h1>
        <p className="lede">
          Every analyzed source file, with its direct relationships. A module is one file.
        </p>
        <div className="filters" role="search">
          <label className="field grow">
            <span>Search paths</span>
            <input
              type="search"
              value={query}
              placeholder="e.g. src/domain"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
          {hasLayers(model) && (
            <label className="field">
              <span>Layer</span>
              <select
                value={layer}
                onChange={(event) => {
                  setLayer(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All layers</option>
                {model.layers.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
                <option value={UNCLASSIFIED}>unclassified</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Show</span>
            <select
              value={show}
              onChange={(event) => {
                setShow(event.target.value as Show);
                setPage(0);
              }}
            >
              {Object.entries(SHOW).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="result-count" role="status">
          {plural(rows.length, 'file')}
          {rows.length !== model.modules.length &&
            ` of ${model.modules.length.toLocaleString('en-US')}`}
        </p>
        {rows.length === 0 ? (
          <EmptyState title="No files match">
            <p>Change the search or filters to see more files.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {header('path', 'Path')}
                  {hasLayers(model) && header('layer', 'Layer')}
                  {header('imports', 'Imports', true)}
                  {header('importedBy', 'Imported by', true)}
                  {header('packages', 'Packages', true)}
                  {header('violations', 'Violations', true)}
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    aria-selected={m.index === selected}
                    className={m.index === selected ? 'selected' : undefined}
                  >
                    <td>
                      <a className="path-link" href={href('modules', { file: m.id })}>
                        {m.id}
                      </a>
                      {m.cycle !== null && <span className="tag inline">cycle {m.cycle + 1}</span>}
                      {m.unresolved.length > 0 && (
                        <span className="tag inline">
                          {plural(m.unresolved.length, 'unresolved')}
                        </span>
                      )}
                    </td>
                    {hasLayers(model) && (
                      <td>
                        <LayerTag model={model} layer={m.layer} />
                      </td>
                    )}
                    <td className="numeric">{m.outgoing.length}</td>
                    <td className="numeric">{m.incoming.length}</td>
                    <td className="numeric">{m.packages.length}</td>
                    <td className="numeric">{m.findings.length + m.involvedIn.length || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />
      </div>
      {selected !== undefined && (
        <aside className="split-detail" aria-label="Selected module">
          <button
            type="button"
            className="button ghost small close-detail"
            onClick={() => {
              navigate('modules');
            }}
          >
            Close
          </button>
          <ModuleCard model={model} index={selected} />
        </aside>
      )}
      {params.get('file') !== null && selected === undefined && (
        <aside className="split-detail">
          <EmptyState title="File not in this report">
            <p>
              <code>{params.get('file')}</code> is not an analyzed source file in this report.
            </p>
          </EmptyState>
        </aside>
      )}
    </div>
  );
}
