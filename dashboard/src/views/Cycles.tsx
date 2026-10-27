import { Icon } from '../components/Icon';
import { FindingRow } from '../components/ModuleCard';
import {
  CardSection,
  CatalogCard,
  DetailPane,
  EmptyState,
  ModuleLink,
  PathChain,
} from '../components/ui';
import { plural } from '../lib/format';
import { href } from '../lib/router';
import type { Model } from '../model/model';

export function Cycles({ model, params }: { model: Model; params: URLSearchParams }) {
  const raw = params.get('cycle');
  const selected = raw === null ? null : Number(raw);
  const cycle = selected === null ? undefined : model.cycles[selected];

  if (model.cycles.length === 0) {
    return (
      <div className="page">
        <h1>Cycles</h1>
        <EmptyState title="No circular dependencies" icon="check">
          <p>
            No group of files imports itself through other files (
            {plural(model.report.summary.nodes, 'file')},{' '}
            {plural(model.report.summary.edges, 'internal dependency', 'internal dependencies')}{' '}
            checked). Only static imports the analysis resolved are considered.
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={`page split${cycle ? ' has-detail' : ''}`}>
      <div className="split-main">
        <h1>Cycles</h1>
        <p className="lede">
          Each group is a strongly connected component of the import graph: every file in it can
          reach every other file.{' '}
          {plural(model.cycles.filter((c) => c.runtime).length, 'group is', 'groups are')} cyclic at
          runtime.
        </p>
        <ol className="cycle-list">
          {model.cycles.map((c, index) => (
            <li key={index}>
              <a
                href={href('cycles', { cycle: index })}
                className={`cycle-item${index === selected ? ' selected' : ''}`}
                aria-current={index === selected ? 'true' : undefined}
              >
                <span className="cycle-title">
                  Cycle {index + 1}
                  <span className="tag">{plural(c.nodes.length, 'file')}</span>
                  <span className={`tag${c.runtime ? ' tag-warning' : ''}`}>
                    {c.runtime ? 'runtime' : 'type-only'}
                  </span>
                </span>
                <span className="cycle-path mono">{c.representativePath.join(' → ')}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
      {selected !== null && !cycle && (
        <aside className="split-detail">
          <EmptyState title="Cycle not found">
            <p>This report has {plural(model.cycles.length, 'cycle')}.</p>
          </EmptyState>
        </aside>
      )}
      {cycle && selected !== null && (
        <DetailPane
          label="Selected cycle"
          closeTo={href('cycles')}
          returnHref={href('cycles', { cycle: selected })}
        >
          <CatalogCard
            label={`Cycle ${String(selected + 1)}`}
            title={`Cycle ${String(selected + 1)}`}
            meta={
              <>
                <span className="tag">{plural(cycle.nodes.length, 'file')}</span>
                <span className="tag">
                  {plural(cycle.edges.length, 'dependency', 'dependencies')}
                </span>
                <span className={`tag${cycle.runtime ? ' tag-warning' : ''}`}>
                  {cycle.runtime ? 'runtime' : 'type-only'}
                </span>
              </>
            }
            actions={
              <a className="button small" href={href('graph', { cycle: selected })}>
                <Icon name="graph" /> Show in graph
              </a>
            }
          >
            <CardSection title="Representative path">
              <PathChain ids={cycle.representativePath} closed />
              <p className="muted">
                One shortest cycle through the first file. A group can contain other cycles; all its
                dependencies are listed below.
              </p>
            </CardSection>
            <CardSection title="Files" count={cycle.nodes.length}>
              <ul className="ref-list">
                {cycle.nodes.map((id) => (
                  <li key={id}>
                    <ModuleLink id={id} />
                  </li>
                ))}
              </ul>
            </CardSection>
            <CardSection title="Dependencies inside the group" count={cycle.edges.length}>
              <ul className="ref-list">
                {cycle.edges.map((edge) => (
                  <li key={`${edge.from}->${edge.to}`}>
                    <ModuleLink id={edge.from} />
                    <span className="chain-step">imports</span>
                    <ModuleLink id={edge.to} />
                    <span className="refs">
                      {edge.references.map((r, i) => (
                        <span key={i} className="ref" title={`"${r.specifier}"`}>
                          {r.line}:{r.column}
                          {r.typeOnly && <span className="kind"> type</span>}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </CardSection>
            <CardSection title="Violations">
              {(() => {
                const members = new Set(cycle.nodes);
                const related = model.findings.filter(
                  (f) =>
                    f.target?.kind === 'cycle' &&
                    f.target.files.length === members.size &&
                    f.target.files.every((file) => members.has(file)),
                );
                return related.length === 0 ? (
                  <p className="muted">
                    No rule reports this group
                    {cycle.runtime
                      ? '.'
                      : ' (type-only cycles are ignored when the rule sets ignore-type-only).'}
                  </p>
                ) : (
                  <ul className="finding-list">
                    {related.map((finding) => (
                      <FindingRow key={finding.id} finding={finding} />
                    ))}
                  </ul>
                );
              })()}
            </CardSection>
            <p className="card-footnote">
              Detected with Tarjan’s strongly connected components over resolved static imports.{' '}
              {cycle.runtime
                ? 'At least one cycle remains when type-only imports are ignored.'
                : 'Every cycle in this group goes through a type-only import, which is erased at runtime.'}
            </p>
          </CatalogCard>
        </DetailPane>
      )}
    </div>
  );
}
