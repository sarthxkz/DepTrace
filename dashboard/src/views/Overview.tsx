import type { ReactNode } from 'react';
import type { Ready } from '../lib/state';
import { Icon, type IconName } from '../components/Icon';
import { BarList, Breakable, EmptyState, Notice, PathText, SeverityBadge } from '../components/ui';
import type { Finding } from '../contract/load';
import { number, plural } from '../lib/format';
import { href } from '../lib/router';
import { hasLayers, UNCLASSIFIED, type Model } from '../model/model';

/** "type-only" with a non-breaking hyphen, so ledger details never wrap inside it. */
const TYPE_ONLY = `type${String.fromCharCode(0x2011)}only`;

interface LedgerRow {
  label: string;
  /** null: the report does not contain this measure. */
  value: number | null;
  detail: ReactNode;
  link?: string;
}

function Ledger({ rows, label }: { rows: LedgerRow[]; label: string }) {
  return (
    <dl className="ledger" aria-label={label}>
      {rows.map((row) => (
        <div className="ledger-row" key={row.label}>
          <dt>{row.link ? <a href={row.link}>{row.label}</a> : row.label}</dt>
          <dd className="ledger-value">{row.value === null ? '—' : number(row.value)}</dd>
          <dd className="ledger-detail">{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Lead {
  key: string;
  icon: IconName;
  tone: 'error' | 'warning' | 'info';
  text: ReactNode;
  link: string;
}

const countBy = <T,>(items: T[], key: (item: T) => string) => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
};

/** Ordered by consequence: failing findings first, then structure problems, then gaps in the analysis. */
function leadsFor(findings: Finding[], model: Model | null, baselineKnown: boolean): Lead[] {
  const leads: Lead[] = [];
  if (baselineKnown) {
    const fresh = findings.filter((f) => f.baselineStatus === 'new');
    if (fresh.length > 0) {
      leads.push({
        key: 'new',
        icon: 'error',
        tone: 'error',
        text: <>{plural(fresh.length, 'new violation')} not accepted by the baseline</>,
        link: href('violations', { baseline: 'new' }),
      });
    }
  }
  for (const severity of ['error', 'warning'] as const) {
    for (const [rule, count] of countBy(
      findings.filter((f) => f.severity === severity),
      (f) => f.ruleId,
    )) {
      leads.push({
        key: `${severity}:${rule}`,
        icon: severity,
        tone: severity,
        text: (
          <>
            {plural(count, severity)} from{' '}
            <code>
              <Breakable text={rule} />
            </code>
          </>
        ),
        link: href('violations', { rule, severity }),
      });
    }
    if (severity === 'error' && model) {
      model.cycles.forEach((cycle, index) => {
        if (!cycle.runtime) return;
        leads.push({
          key: `cycle:${String(index)}`,
          icon: 'cycles',
          tone: 'warning',
          text: (
            <>
              Runtime cycle of {plural(cycle.nodes.length, 'file')} through{' '}
              <code>
                <Breakable text={cycle.nodes[0] ?? ''} />
              </code>
            </>
          ),
          link: href('cycles', { cycle: index }),
        });
      });
    }
  }
  if (model) {
    const { summary } = model.report;
    const unresolvedFiles = model.modules.filter((m) => m.unresolved.length > 0).length;
    if (summary.unresolvedReferences > 0) {
      leads.push({
        key: 'unresolved',
        icon: 'info',
        tone: 'info',
        text: (
          <>
            {plural(summary.unresolvedReferences, 'unresolved import')} in{' '}
            {plural(unresolvedFiles, 'file')}: rules cannot check them
          </>
        ),
        link: href('modules', { show: 'unresolved' }),
      });
    }
    if (summary.filesWithParseErrors + summary.filesUnreadable > 0) {
      leads.push({
        key: 'parse',
        icon: 'info',
        tone: 'info',
        text: (
          <>
            {plural(summary.filesWithParseErrors + summary.filesUnreadable, 'file')} could not be
            fully parsed or read
          </>
        ),
        link: href('modules', { show: 'problems' }),
      });
    }
    const typeOnly = model.cycles.filter((cycle) => !cycle.runtime).length;
    if (typeOnly > 0) {
      leads.push({
        key: 'type-cycles',
        icon: 'cycles',
        tone: 'info',
        text: <>{plural(typeOnly, 'type-only cycle')} (erased at runtime)</>,
        link: href('cycles'),
      });
    }
  }
  return leads;
}

export function Overview({ ready }: { ready: Ready }) {
  const { model, loaded } = ready;
  const findings = loaded.findings;
  const baseline = loaded.kind === 'report' ? loaded.report.architecture.baseline : loaded.baseline;
  const baselineKnown = baseline !== null || findings.some((f) => f.baselineStatus !== null);
  const leads = leadsFor(findings, model, baselineKnown);
  const shown = leads.slice(0, 8);
  const rules = loaded.kind === 'report' ? loaded.report.architecture.rules : loaded.rules;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const notes = findings.length - errors - warnings;

  return (
    <div className="page overview">
      <h1>Overview</h1>
      {model ? (
        <Ledger
          label="Analysis summary"
          rows={ledgerRows(model, rules?.length ?? 0, errors, warnings)}
        />
      ) : (
        <Ledger
          label="Findings summary"
          rows={[
            {
              label: 'Findings',
              value: findings.length,
              detail: `${plural(errors, 'error')}, ${plural(warnings, 'warning')}${notes > 0 ? `, ${plural(notes, 'note')}` : ''}`,
              link: href('violations'),
            },
            {
              label: 'Rules',
              value: rules?.length ?? null,
              detail: rules
                ? `${String(rules.filter((r) => r.severity !== 'off').length)} enabled`
                : 'Not recorded in SARIF',
            },
            {
              label: 'Dependency graph',
              value: null,
              detail:
                'Not in this document. Load a "deptrace report --format json" file for the graph, layers, cycles and modules.',
            },
          ]}
        />
      )}

      {baseline && (
        <Notice>
          Compared with the baseline <code>{baseline.file}</code>:{' '}
          {plural(baseline.new, 'new violation')}, {number(baseline.existing)} accepted,{' '}
          {number(baseline.resolved)} resolved.
          {baseline.resolved > 0 &&
            ' Remove resolved entries with "deptrace baseline update" so they cannot return unnoticed.'}
        </Notice>
      )}

      <div className="overview-grid">
        <section className="panel" aria-labelledby="leads-title">
          <h2 id="leads-title">Where to start</h2>
          {shown.length === 0 ? (
            <EmptyState title="Nothing in this report needs attention" icon="check">
              <p>
                No violations{model ? ', cycles, unresolved imports or parse problems' : ''} were
                reported. This only covers{' '}
                {rules && rules.length > 0
                  ? `the ${plural(rules.length, 'rule')} configured in deptrace.yml`
                  : 'rules configured in deptrace.yml (none are)'}{' '}
                and static imports; it is not a verdict on the architecture.
              </p>
            </EmptyState>
          ) : (
            <ol className="lead-list">
              {shown.map((lead) => (
                <li key={lead.key} className={`lead lead-${lead.tone}`}>
                  <Icon name={lead.icon} />
                  <a href={lead.link}>{lead.text}</a>
                </li>
              ))}
            </ol>
          )}
          {leads.length > shown.length && (
            <p className="muted">
              {plural(leads.length - shown.length, 'more item')} on the{' '}
              <a href={href('violations')}>Violations</a> page.
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="rules-title">
          <h2 id="rules-title">Violations by rule</h2>
          {rules === null ? (
            <BarList
              label="Findings by rule"
              rows={countBy(findings, (f) => f.ruleId).map(([rule, value]) => ({
                key: rule,
                label: (
                  <code>
                    <Breakable text={rule} />
                  </code>
                ),
                value,
              }))}
            />
          ) : rules.length === 0 ? (
            <EmptyState title="No rules configured">
              <p>Add rules to deptrace.yml to check the architecture (see docs/rules.md).</p>
            </EmptyState>
          ) : (
            <BarList
              label="Violations by rule"
              rows={rules.map((rule) => ({
                key: rule.id,
                label: (
                  <span className="rule-label">
                    <code>
                      <Breakable text={rule.id} />
                    </code>
                    <SeverityBadge severity={rule.severity} />
                  </span>
                ),
                value: rule.violations,
                title: rule.description,
              }))}
            />
          )}
        </section>

        {model && <LayerBreakdown model={model} />}
        {model && <Concentration model={model} />}
        {model && <ImportKinds model={model} />}
      </div>
    </div>
  );
}

function ledgerRows(model: Model, rules: number, errors: number, warnings: number): LedgerRow[] {
  const { summary } = model.report;
  const builtins = model.packages.filter((p) => p.builtin).length;
  const rows: LedgerRow[] = [
    {
      label: 'Source files',
      value: summary.nodes,
      detail:
        summary.filesWithParseErrors + summary.filesUnreadable > 0
          ? `${plural(summary.filesWithParseErrors, 'file')} with parse errors, ${number(summary.filesUnreadable)} unreadable`
          : 'all parsed',
      link: href('modules'),
    },
    {
      label: 'Internal dependencies',
      value: summary.edges,
      detail: `file-to-file; ${plural(summary.internalReferences, 'import statement')}, ${number(summary.typeOnlyEdges)} ${TYPE_ONLY}`,
      link: href('graph'),
    },
    {
      label: 'External packages',
      value: summary.externalPackages,
      detail: `${plural(summary.externalReferences, 'import')}${builtins > 0 ? `; ${number(builtins)} Node.js built-in` : ''}`,
    },
    {
      label: 'Cycle groups',
      value: summary.cyclicComponents,
      detail: `${number(summary.runtimeCycles)} runtime, ${number(summary.cyclicComponents - summary.runtimeCycles)} ${TYPE_ONLY}`,
      link: href('cycles'),
    },
    rules === 0
      ? { label: 'Violations', value: null, detail: 'No rules configured in deptrace.yml' }
      : {
          label: 'Violations',
          value: errors + warnings,
          detail: `${plural(errors, 'error')}, ${plural(warnings, 'warning')}`,
          link: href('violations'),
        },
    {
      label: 'Unresolved imports',
      value: summary.unresolvedReferences,
      detail:
        summary.unresolvedReferences > 0 ? 'not checked by rules' : 'every import was resolved',
    },
    hasLayers(model)
      ? {
          label: 'Unclassified files',
          value: model.unclassified.length,
          detail: `in no layer of ${plural(model.layers.length, 'configured layer')}`,
          link: href('layers'),
        }
      : {
          label: 'Unclassified files',
          value: null,
          detail: 'No layers configured in deptrace.yml',
        },
    {
      label: 'Analysis diagnostics',
      value: summary.errors + summary.warnings,
      detail: `${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')} from parsing and resolution`,
    },
  ];
  return rows;
}

function LayerBreakdown({ model }: { model: Model }) {
  return (
    <section className="panel" aria-labelledby="layers-title">
      <h2 id="layers-title">Files per layer</h2>
      {hasLayers(model) ? (
        <BarList
          label="Files per layer"
          rows={[
            ...model.layers.map((layer) => ({
              key: layer.name,
              label: (
                <a href={href('layers', { layer: layer.name })} className="layer-label">
                  <span className="swatch" data-slot={layer.slot ?? 'none'} aria-hidden="true" />
                  {layer.name}
                </a>
              ),
              value: layer.modules.length,
              color:
                layer.slot === null
                  ? 'var(--layer-none)'
                  : `var(--layer-${String(layer.slot + 1)})`,
            })),
            {
              key: UNCLASSIFIED,
              label: (
                <span className="layer-label">
                  <span className="swatch" data-slot="none" aria-hidden="true" />
                  unclassified
                </span>
              ),
              value: model.unclassified.length,
              color: 'var(--layer-none)',
            },
          ]}
        />
      ) : (
        <EmptyState title="No layers configured">
          <p>
            Layers group files by glob in deptrace.yml (for example <code>src/domain/**</code>).
            DepTrace never infers them.
          </p>
        </EmptyState>
      )}
    </section>
  );
}

function Concentration({ model }: { model: Model }) {
  const top = (key: 'incoming' | 'outgoing') =>
    [...model.modules]
      .filter((m) => m[key].length > 0)
      .sort((a, b) => b[key].length - a[key].length || (a.id < b.id ? -1 : 1))
      .slice(0, 6)
      .map((m) => ({
        key: m.id,
        label: (
          <a className="path-link" href={href('modules', { file: m.id })} title={m.id}>
            <PathText id={m.id} />
          </a>
        ),
        value: m[key].length,
      }));
  const incoming = top('incoming');
  const outgoing = top('outgoing');
  return (
    <>
      <section className="panel" aria-labelledby="fan-in-title">
        <h2 id="fan-in-title">Most imported files</h2>
        <p className="panel-note">Number of files that import each file directly.</p>
        {incoming.length > 0 ? (
          <BarList label="Most imported files" rows={incoming} />
        ) : (
          <p className="muted">No internal imports.</p>
        )}
      </section>
      <section className="panel" aria-labelledby="fan-out-title">
        <h2 id="fan-out-title">Files with the most dependencies</h2>
        <p className="panel-note">Number of files each file imports directly.</p>
        {outgoing.length > 0 ? (
          <BarList label="Files with the most dependencies" rows={outgoing} />
        ) : (
          <p className="muted">No internal imports.</p>
        )}
      </section>
    </>
  );
}

function ImportKinds({ model }: { model: Model }) {
  const { report } = model;
  const kinds = new Map<string, number>();
  const add = (kind: string) => kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  for (const edge of report.edges) for (const r of edge.references) add(r.kind);
  for (const dependency of report.externalDependencies)
    for (const r of dependency.references) add(r.kind);
  for (const r of report.unresolvedDependencies) add(r.kind);
  const rows = [...kinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, value]) => ({ key: kind, label: <code>{kind}</code>, value }));
  return (
    <section className="panel" aria-labelledby="kinds-title">
      <h2 id="kinds-title">Import statements by kind</h2>
      <p className="panel-note">Internal, external and unresolved imports.</p>
      {rows.length === 0 ? (
        <p className="muted">No imports found.</p>
      ) : rows.length === 1 ? (
        <p>
          All {number(rows[0]?.value ?? 0)} import statements are <code>{rows[0]?.key}</code>{' '}
          imports.
        </p>
      ) : (
        <BarList label="Import statements by kind" rows={rows} />
      )}
    </section>
  );
}
