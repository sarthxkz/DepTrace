import { useState } from 'react';
import type { Finding } from '../contract/load';
import type { ImportRef } from '../contract/report';
import { plural } from '../lib/format';
import { href } from '../lib/router';
import { reach } from '../model/graph';
import { hasLayers, type Model } from '../model/model';
import { Icon } from './Icon';
import { CardSection, CatalogCard, CopyButton, ModuleLink, SeverityBadge } from './ui';

const LIST_LIMIT = 200;

function References({ refs }: { refs: ImportRef[] }) {
  return (
    <span className="refs">
      {refs.map((ref, index) => (
        <span
          key={index}
          className="ref"
          title={`"${ref.specifier}" (${ref.kind}${ref.typeOnly ? ', type-only' : ''})`}
        >
          {ref.line}:{ref.column}
          {ref.kind !== 'import' && <span className="kind"> {ref.kind}</span>}
          {ref.typeOnly && <span className="kind"> type</span>}
        </span>
      ))}
    </span>
  );
}

export function LayerTag({ model, layer }: { model: Model; layer: string | null }) {
  if (!hasLayers(model)) return <span className="tag">no layers configured</span>;
  const slot = layer === null ? null : model.layerByName.get(layer)?.slot;
  return (
    <a className="tag layer-tag" href={href('layers', { layer: layer ?? 'unclassified' })}>
      <span className="swatch" data-slot={slot ?? 'none'} aria-hidden="true" />
      {layer ?? 'unclassified'}
    </a>
  );
}

export function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="finding-row">
      <SeverityBadge severity={finding.severity} />
      <a href={href('violations', { finding: finding.id })}>
        <code>{finding.ruleId}</code>
      </a>
      <span className="finding-message">{finding.message}</span>
    </li>
  );
}

function Transitive({
  model,
  index,
  direction,
}: {
  model: Model;
  index: number;
  direction: 'out' | 'in';
}) {
  const [depth, setDepth] = useState<number>(Number.POSITIVE_INFINITY);
  const reached = [...reach(model, [index], direction, depth).entries()].sort(
    (a, b) =>
      a[1] - b[1] || ((model.modules[a[0]]?.id ?? '') < (model.modules[b[0]]?.id ?? '') ? -1 : 1),
  );
  const noun = direction === 'out' ? 'dependency' : 'dependent';
  const label = direction === 'out' ? 'Transitive dependencies' : 'Transitive dependents';
  return (
    <details className="transitive">
      <summary>
        {label}: {plural(reached.length, `file`)}
        {Number.isFinite(depth) ? ` within ${String(depth)} step${depth === 1 ? '' : 's'}` : ''}
      </summary>
      <div className="depth-control" role="group" aria-label={`${label} depth`}>
        <span>Depth</span>
        {[1, 2, 3, Number.POSITIVE_INFINITY].map((value) => (
          <button
            key={value}
            type="button"
            className="button small"
            aria-pressed={depth === value}
            onClick={() => {
              setDepth(value);
            }}
          >
            {Number.isFinite(value) ? value : 'all'}
          </button>
        ))}
      </div>
      {reached.length === 0 ? (
        <p className="muted">
          No transitive {noun === 'dependency' ? 'dependencies' : 'dependents'}.
        </p>
      ) : (
        <ul className="ref-list">
          {reached.slice(0, LIST_LIMIT).map(([module, steps]) => (
            <li key={module}>
              <span className="steps" title="Import steps away">
                {steps}
              </span>
              <ModuleLink id={model.modules[module]?.id ?? ''} />
            </li>
          ))}
          {reached.length > LIST_LIMIT && (
            <li className="muted">
              and {plural(reached.length - LIST_LIMIT, 'more file')} (narrow the depth to list them)
            </li>
          )}
        </ul>
      )}
    </details>
  );
}

/** The pulled catalog card of one module: everything the report says about the file. */
export function ModuleCard({ model, index }: { model: Model; index: number }) {
  const module = model.modules[index];
  if (!module) return null;
  const imports = module.outgoing
    .map((e) => model.edges[e])
    .filter((e) => e !== undefined)
    .sort((a, b) => ((model.modules[a.to]?.id ?? '') < (model.modules[b.to]?.id ?? '') ? -1 : 1));
  const importers = module.incoming
    .map((e) => model.edges[e])
    .filter((e) => e !== undefined)
    .sort((a, b) =>
      (model.modules[a.from]?.id ?? '') < (model.modules[b.from]?.id ?? '') ? -1 : 1,
    );
  const packageRefs = model.report.externalDependencies
    .map((dependency) => ({
      dependency,
      refs: dependency.references.filter((r) => r.file === module.id),
    }))
    .filter((entry) => entry.refs.length > 0);

  return (
    <CatalogCard
      label={`Module ${module.id}`}
      title={<span className="mono">{module.id}</span>}
      meta={
        <>
          <LayerTag model={model} layer={module.layer} />
          {module.status !== 'parsed' && <span className="tag tag-warning">{module.status}</span>}
          {module.cycle !== null && (
            <a className="tag" href={href('cycles', { cycle: module.cycle })}>
              <Icon name="cycles" size={14} /> in cycle {module.cycle + 1}
            </a>
          )}
        </>
      }
      actions={
        <>
          <a className="button small" href={href('graph', { focus: module.id })}>
            <Icon name="graph" /> Show in graph
          </a>
          <CopyButton value={module.id} label="Copy path" />
        </>
      }
    >
      <CardSection title="Imports" count={imports.length}>
        {imports.length === 0 ? (
          <p className="muted">No internal imports.</p>
        ) : (
          <ul className="ref-list">
            {imports.map((edge) => (
              <li key={edge.index}>
                <ModuleLink id={model.modules[edge.to]?.id ?? ''} />
                <References refs={edge.references} />
              </li>
            ))}
          </ul>
        )}
      </CardSection>
      <CardSection title="Imported by" count={importers.length}>
        {importers.length === 0 ? (
          <p className="muted">No file imports this one.</p>
        ) : (
          <ul className="ref-list">
            {importers.map((edge) => (
              <li key={edge.index}>
                <ModuleLink id={model.modules[edge.from]?.id ?? ''} />
                <References refs={edge.references} />
              </li>
            ))}
          </ul>
        )}
      </CardSection>
      <CardSection title="Reach">
        <Transitive model={model} index={index} direction="out" />
        <Transitive model={model} index={index} direction="in" />
      </CardSection>
      {packageRefs.length > 0 && (
        <CardSection title="External packages" count={packageRefs.length}>
          <ul className="ref-list">
            {packageRefs.map(({ dependency, refs }) => (
              <li key={dependency.packageName}>
                <span className="mono">
                  <Icon name="package" size={14} /> {dependency.packageName}
                </span>
                {dependency.builtin && <span className="tag">built-in</span>}
                <References refs={refs} />
              </li>
            ))}
          </ul>
        </CardSection>
      )}
      {module.unresolved.length > 0 && (
        <CardSection title="Unresolved imports" count={module.unresolved.length}>
          <ul className="ref-list">
            {module.unresolved.map((ref, i) => (
              <li key={i}>
                <code>{ref.specifier}</code>
                <span className="tag">{ref.reason}</span>
                <span className="ref">
                  {ref.line}:{ref.column}
                </span>
              </li>
            ))}
          </ul>
        </CardSection>
      )}
      <CardSection title="Violations" count={module.findings.length + module.involvedIn.length}>
        {module.findings.length + module.involvedIn.length === 0 ? (
          <p className="muted">None reported for this file.</p>
        ) : (
          <ul className="finding-list">
            {module.findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
            {module.involvedIn.map((finding) => (
              <FindingRow key={`in:${finding.id}`} finding={finding} />
            ))}
          </ul>
        )}
      </CardSection>
      <p className="card-footnote">
        Static imports only: dependencies created at runtime (dependency injection, computed paths)
        are not visible.
      </p>
    </CatalogCard>
  );
}
