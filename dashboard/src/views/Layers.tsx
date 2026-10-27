import { Fragment } from 'react';
import { Icon } from '../components/Icon';
import { FindingRow } from '../components/ModuleCard';
import {
  CardSection,
  CatalogCard,
  DetailPane,
  EmptyState,
  ModuleLink,
  Notice,
} from '../components/ui';
import { plural } from '../lib/format';
import { href } from '../lib/router';
import { UNCLASSIFIED, type EdgeInfo, type Model } from '../model/model';

type Policy = 'same' | 'allowed' | 'forbidden' | 'ungoverned' | 'unknown';

const POLICY_LABEL: Record<Policy, string> = {
  same: 'within the layer',
  allowed: 'allowed by layer-boundaries',
  forbidden: 'forbidden by layer-boundaries',
  ungoverned: 'not governed (unclassified files are not checked)',
  unknown: 'no layer-boundaries rule',
};

const groupName = (layer: string | null) => layer ?? UNCLASSIFIED;
const display = (group: string) => (group === UNCLASSIFIED ? 'unclassified' : group);

export function Layers({ model, params }: { model: Model; params: URLSearchParams }) {
  if (model.layers.length === 0) {
    return (
      <div className="page">
        <h1>Layers</h1>
        <EmptyState title="No layers configured">
          <p>
            DepTrace does not infer layers. Define them in <code>deptrace.yml</code>; a file belongs
            to the first layer whose patterns match it:
          </p>
          <pre className="code-block">{`layers:
  - name: domain
    files: ["src/domain/**"]
  - name: infrastructure
    files: ["src/infrastructure/**"]
rules:
  layer-boundaries:
    allowed:
      infrastructure: [domain]
      domain: []`}</pre>
        </EmptyState>
      </div>
    );
  }

  const { layerRule } = model.report.architecture;
  const groups = [
    ...model.layers.map((l) => l.name),
    ...(model.unclassified.length > 0 ? [UNCLASSIFIED] : []),
  ];
  const policy = (from: string, to: string): Policy => {
    if (from === to) return 'same';
    if (from === UNCLASSIFIED || to === UNCLASSIFIED) return 'ungoverned';
    if (!layerRule || layerRule.severity === 'off') return 'unknown';
    return (layerRule.allowed[from] ?? []).includes(to) ? 'allowed' : 'forbidden';
  };
  const cells = new Map<string, EdgeInfo[]>();
  for (const edge of model.edges) {
    const key = `${groupName(model.modules[edge.from]?.layer ?? null)}\0${groupName(model.modules[edge.to]?.layer ?? null)}`;
    cells.set(key, [...(cells.get(key) ?? []), edge]);
  }
  const boundaryFindings = (from: string, to: string) =>
    model.findings.filter(
      (f) =>
        layerRule &&
        f.ruleId === layerRule.id &&
        f.file !== null &&
        groupName(model.modules[model.byId.get(f.file) ?? -1]?.layer ?? null) === from &&
        f.target?.kind === 'file' &&
        groupName(model.modules[model.byId.get(f.target.path) ?? -1]?.layer ?? null) === to,
    );

  const selectedLayer = params.get('layer');
  const from = params.get('from');
  const to = params.get('to');

  return (
    <div className={`page split${(selectedLayer ?? from) ? ' has-detail' : ''}`}>
      <div className="split-main">
        <h1>Layers</h1>
        <p className="lede">
          Layers come from <code>deptrace.yml</code>. Rows import columns; each cell counts
          file-to-file dependencies.
        </p>
        {layerRule === undefined && (
          <Notice>
            This report predates layer policies in reports, so allowed and forbidden pairs cannot be
            shown.
          </Notice>
        )}
        {layerRule === null && (
          <Notice>No layer-boundaries rule is configured, so no layer pair is forbidden.</Notice>
        )}
        <div className="table-wrap">
          <table className="layer-matrix">
            <caption className="visually-hidden">
              Dependencies between layers: rows import columns
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Importer layer</span>
                </th>
                {groups.map((group) => (
                  <th scope="col" key={group}>
                    <LayerName model={model} group={group} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((row) => (
                <tr key={row}>
                  <th scope="row">
                    <LayerName model={model} group={row} />
                  </th>
                  {groups.map((column) => {
                    const edges = cells.get(`${row}\0${column}`) ?? [];
                    const kind = policy(row, column);
                    const violations = boundaryFindings(row, column).length;
                    const selected = row === from && column === to;
                    return (
                      <td
                        key={column}
                        className={`cell cell-${kind}${edges.length > 0 ? ' used' : ''}${selected ? ' selected' : ''}`}
                      >
                        <a
                          href={href('layers', { from: row, to: column })}
                          aria-label={`${display(row)} imports ${display(column)}: ${plural(edges.length, 'dependency', 'dependencies')}, ${POLICY_LABEL[kind]}${violations > 0 ? `, ${plural(violations, 'violation')}` : ''}`}
                        >
                          <span className="cell-count">{edges.length > 0 ? edges.length : ''}</span>
                          {kind === 'forbidden' && edges.length > 0 && (
                            <span className="cell-flag">
                              <Icon name="error" size={12} />
                              {violations}
                            </span>
                          )}
                        </a>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="matrix-legend" aria-label="Legend">
          <li>
            <span className="legend-cell cell-allowed" /> allowed
          </li>
          <li>
            <span className="legend-cell cell-forbidden used" /> forbidden and used (flag:
            violations reported)
          </li>
          <li>
            <span className="legend-cell cell-forbidden" /> forbidden, unused
          </li>
          <li>
            <span className="legend-cell cell-same" /> within a layer
          </li>
          <li>
            <span className="legend-cell cell-ungoverned" /> involves unclassified files
          </li>
        </ul>
        <p className="muted">
          A forbidden dependency is not reported when the rule excludes the file or ignores
          type-only imports, so counts and violations can differ.
        </p>

        <h2>Layer definitions</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Patterns</th>
                <th scope="col" className="numeric">
                  Files
                </th>
                <th scope="col">May import</th>
              </tr>
            </thead>
            <tbody>
              {model.layers.map((layer) => (
                <tr key={layer.name}>
                  <td>
                    <a href={href('layers', { layer: layer.name })} className="layer-label">
                      <span
                        className="swatch"
                        data-slot={layer.slot ?? 'none'}
                        aria-hidden="true"
                      />
                      {layer.name}
                    </a>
                  </td>
                  <td className="mono">{layer.patterns.join(', ')}</td>
                  <td className="numeric">{layer.modules.length}</td>
                  <td>
                    {layerRule
                      ? (layerRule.allowed[layer.name] ?? []).join(', ') || 'no other layer'
                      : '—'}
                  </td>
                </tr>
              ))}
              {model.unclassified.length > 0 && (
                <tr>
                  <td>
                    <a href={href('layers', { layer: 'unclassified' })} className="layer-label">
                      <span className="swatch" data-slot="none" aria-hidden="true" />
                      unclassified
                    </a>
                  </td>
                  <td className="muted">matches no layer pattern</td>
                  <td className="numeric">{model.unclassified.length}</td>
                  <td className="muted">not checked by layer-boundaries</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLayer !== null && <LayerCard model={model} name={selectedLayer} />}
      {selectedLayer === null && from !== null && to !== null && (
        <DetailPane
          label="Selected layer pair"
          closeTo={href('layers')}
          returnHref={href('layers', { from, to })}
        >
          <CatalogCard
            label={`${display(from)} imports ${display(to)}`}
            title={
              <>
                {display(from)} <span className="chain-step">imports</span> {display(to)}
              </>
            }
            meta={
              <span className={`tag cell-tag-${policy(from, to)}`}>
                {POLICY_LABEL[policy(from, to)]}
              </span>
            }
          >
            <CardSection title="Dependencies" count={(cells.get(`${from}\0${to}`) ?? []).length}>
              {(cells.get(`${from}\0${to}`) ?? []).length === 0 ? (
                <p className="muted">
                  No file in {display(from)} imports a file in {display(to)}.
                </p>
              ) : (
                <ul className="ref-list">
                  {(cells.get(`${from}\0${to}`) ?? []).map((edge) => (
                    <li key={edge.index}>
                      <ModuleLink id={model.modules[edge.from]?.id ?? ''} />
                      <span className="chain-step">imports</span>
                      <ModuleLink id={model.modules[edge.to]?.id ?? ''} />
                      {edge.typeOnly && <span className="tag">type-only</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardSection>
            <CardSection title="Boundary violations" count={boundaryFindings(from, to).length}>
              {boundaryFindings(from, to).length === 0 ? (
                <p className="muted">None reported.</p>
              ) : (
                <ul className="finding-list">
                  {boundaryFindings(from, to).map((finding) => (
                    <FindingRow key={finding.id} finding={finding} />
                  ))}
                </ul>
              )}
            </CardSection>
          </CatalogCard>
        </DetailPane>
      )}
    </div>
  );
}

function LayerName({ model, group }: { model: Model; group: string }) {
  const slot = group === UNCLASSIFIED ? null : model.layerByName.get(group)?.slot;
  return (
    <a
      className="layer-label"
      href={href('layers', { layer: group === UNCLASSIFIED ? 'unclassified' : group })}
    >
      <span className="swatch" data-slot={slot ?? 'none'} aria-hidden="true" />
      {display(group)}
    </a>
  );
}

function LayerCard({ model, name }: { model: Model; name: string }) {
  const unclassified = name === 'unclassified';
  const layer = unclassified ? undefined : model.layerByName.get(name);
  if (!unclassified && !layer) {
    return (
      <aside className="split-detail">
        <EmptyState title="Layer not found">
          <p>
            <code>{name}</code> is not a layer in this report.
          </p>
        </EmptyState>
      </aside>
    );
  }
  const members = unclassified ? model.unclassified : (layer?.modules ?? []);
  const memberSet = new Set(members);
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of model.edges) {
    const a = memberSet.has(edge.from);
    const b = memberSet.has(edge.to);
    if (a && !b) {
      const group = display(groupName(model.modules[edge.to]?.layer ?? null));
      outgoing.set(group, (outgoing.get(group) ?? 0) + 1);
    } else if (b && !a) {
      const group = display(groupName(model.modules[edge.from]?.layer ?? null));
      incoming.set(group, (incoming.get(group) ?? 0) + 1);
    }
  }
  const findings = model.findings.filter(
    (f) => f.file !== null && memberSet.has(model.byId.get(f.file) ?? -1),
  );
  const allowed = model.report.architecture.layerRule?.allowed[name];
  return (
    <DetailPane
      label="Selected layer"
      closeTo={href('layers')}
      returnHref={href('layers', { layer: name })}
    >
      <CatalogCard
        label={`Layer ${unclassified ? 'unclassified' : name}`}
        title={
          <span className="layer-label">
            <span className="swatch" data-slot={layer?.slot ?? 'none'} aria-hidden="true" />
            {unclassified ? 'unclassified' : name}
          </span>
        }
        meta={
          <>
            <span className="tag">{plural(members.length, 'file')}</span>
            {layer && <span className="tag mono">{layer.patterns.join(', ')}</span>}
          </>
        }
        actions={
          <a
            className="button small"
            href={href('graph', { layer: unclassified ? UNCLASSIFIED : name })}
          >
            <Icon name="graph" /> Show in graph
          </a>
        }
      >
        {!unclassified && (
          <CardSection title="May import">
            <p>
              {allowed === undefined
                ? 'Not governed by a layer-boundaries rule.'
                : allowed.length === 0
                  ? 'No other layer.'
                  : allowed.join(', ')}
            </p>
          </CardSection>
        )}
        <CardSection title="Imports from other groups">
          {outgoing.size === 0 ? <p className="muted">None.</p> : <CountList counts={outgoing} />}
        </CardSection>
        <CardSection title="Imported by other groups">
          {incoming.size === 0 ? <p className="muted">None.</p> : <CountList counts={incoming} />}
        </CardSection>
        <CardSection title="Violations from this group" count={findings.length}>
          {findings.length === 0 ? (
            <p className="muted">None reported.</p>
          ) : (
            <ul className="finding-list">
              {findings.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))}
            </ul>
          )}
        </CardSection>
        <CardSection title="Files" count={members.length}>
          <ul className="ref-list">
            {members.map((index) => (
              <li key={index}>
                <ModuleLink id={model.modules[index]?.id ?? ''} />
              </li>
            ))}
          </ul>
        </CardSection>
      </CatalogCard>
    </DetailPane>
  );
}

function CountList({ counts }: { counts: Map<string, number> }) {
  return (
    <dl className="count-list">
      {[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([group, count]) => (
          <Fragment key={group}>
            <dt>{group}</dt>
            <dd>{plural(count, 'dependency', 'dependencies')}</dd>
          </Fragment>
        ))}
    </dl>
  );
}
