import { useState, type ReactNode } from 'react';
import type { AuditControl, Ready } from '../lib/state';
import { Icon, type IconName } from '../components/Icon';
import { BaselineBadge, Breakable, EmptyState, Notice, SeverityBadge } from '../components/ui';
import type { Finding } from '../contract/load';
import { location, number, plural, revealControls } from '../lib/format';
import { href } from '../lib/router';
import { hasLayers, type Model } from '../model/model';
import { AuditConsent } from './Vulnerabilities';

/** "type-only" with a non-breaking hyphen, so ledger details never wrap inside it. */
const TYPE_ONLY = `type${String.fromCharCode(0x2011)}only`;
const SHOWN_FINDINGS = 6;
const SEVERITY_RANK = { error: 0, warning: 1, note: 2 } as const;

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

/** New findings first, then by severity; the analyzer's order breaks ties. */
function rankFindings(findings: Finding[]): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (a, b) =>
        Number(b.finding.baselineStatus === 'new') - Number(a.finding.baselineStatus === 'new') ||
        SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
        a.index - b.index,
    )
    .map(({ finding }) => finding);
}

interface Lead {
  key: string;
  icon: IconName;
  text: ReactNode;
  link: string;
}

/** What the analysis itself points at, beyond rule violations. */
function analysisLeads(model: Model): Lead[] {
  const leads: Lead[] = [];
  model.cycles.forEach((cycle, index) => {
    if (!cycle.runtime) return;
    leads.push({
      key: `cycle:${String(index)}`,
      icon: 'cycles',
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
  const { summary } = model.report;
  const unresolvedFiles = model.modules.filter((m) => m.unresolved.length > 0).length;
  if (summary.unresolvedReferences > 0) {
    leads.push({
      key: 'unresolved',
      icon: 'info',
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
      text: <>{plural(typeOnly, 'type-only cycle')} (erased at runtime)</>,
      link: href('cycles'),
    });
  }
  return leads;
}

export function Overview({ ready, audit }: { ready: Ready; audit: AuditControl }) {
  const { model, loaded } = ready;
  const findings = loaded.findings;
  const baseline = loaded.kind === 'report' ? loaded.report.architecture.baseline : loaded.baseline;
  const rules = loaded.kind === 'report' ? loaded.report.architecture.rules : loaded.rules;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const fresh = findings.filter((f) => f.baselineStatus === 'new').length;
  const ranked = rankFindings(findings);
  const leads = model ? analysisLeads(model) : [];

  return (
    <div className="page overview">
      <h1 className="visually-hidden">Overview</h1>
      <dl className="strip health" aria-label="Health">
        <HealthCell
          label="Violations"
          tone={errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'good'}
          value={rules?.length === 0 ? '—' : number(findings.length)}
          link={href('violations')}
        >
          {rules?.length === 0 ? (
            'No rules configured in deptrace.yml'
          ) : (
            <>
              {plural(errors, 'error')} · {plural(warnings, 'warning')}
              {fresh > 0 && <span className="badge baseline-new">{number(fresh)} new</span>}
            </>
          )}
        </HealthCell>
        <HealthCell
          label="Runtime cycles"
          tone={model && model.report.summary.runtimeCycles > 0 ? 'cycle' : 'good'}
          value={model ? number(model.report.summary.runtimeCycles) : '—'}
          {...(model && { link: href('cycles') })}
        >
          {model
            ? `${number(model.report.summary.cyclicComponents - model.report.summary.runtimeCycles)} ${TYPE_ONLY} besides`
            : 'Not in this document'}
        </HealthCell>
        <AuditCell audit={audit} />
        <HealthCell
          label="Files"
          tone="plain"
          value={model ? number(model.report.summary.nodes) : '—'}
          {...(model && { link: href('modules') })}
        >
          {model
            ? `${plural(model.report.summary.edges, 'dependency', 'dependencies')}${hasLayers(model) ? ` · ${number(model.unclassified.length)} in no layer` : ''}`
            : 'Findings only: no dependency graph'}
        </HealthCell>
      </dl>

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
        <section className="panel start" aria-labelledby="start-title">
          <header className="panel-head">
            <h2 id="start-title">Where to start</h2>
            {findings.length > 0 && (
              <a className="panel-link" href={href('violations')}>
                All {plural(findings.length, 'violation')} <Icon name="arrowRight" size={14} />
              </a>
            )}
          </header>
          {ranked.length === 0 && leads.length === 0 ? (
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
            <>
              {ranked.length > 0 && (
                <FixList findings={ranked.slice(0, SHOWN_FINDINGS)} hasGraph={model !== null} />
              )}
              {ranked.length > SHOWN_FINDINGS && (
                <p className="panel-foot muted">
                  {plural(ranked.length - SHOWN_FINDINGS, 'more violation')} on the{' '}
                  <a href={href('violations')}>Violations</a> page.
                </p>
              )}
              {leads.length > 0 && (
                <div className="also">
                  <h3 className="label">Also in the analysis</h3>
                  <ul className="lead-list">
                    {leads.map((lead) => (
                      <li key={lead.key}>
                        <Icon name={lead.icon} size={16} />
                        <a href={lead.link}>{lead.text}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <div className="overview-side">
          {model && <LayerPanel model={model} />}
          <section className="panel" aria-labelledby="analysis-title">
            <header className="panel-head">
              <h2 id="analysis-title">Analysis</h2>
            </header>
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
          </section>
        </div>
      </div>
    </div>
  );
}

function HealthCell({
  label,
  value,
  tone,
  link,
  children,
}: {
  label: string;
  value: string;
  tone: string;
  link?: string;
  children: ReactNode;
}) {
  return (
    <div className={`strip-cell tone-${tone}`}>
      <dt>{link ? <a href={link}>{label}</a> : label}</dt>
      <dd className="strip-value">{value}</dd>
      <dd className="strip-detail">{children}</dd>
    </div>
  );
}

function AuditCell({ audit }: { audit: AuditControl }) {
  const { state } = audit;
  const link = href('vulnerabilities');
  if (state.status === 'done') {
    const { summary, packages } = state.report;
    const worst = (['critical', 'high', 'moderate', 'low', 'info'] as const).find(
      (s) => summary[s] > 0,
    );
    return (
      <HealthCell
        label="Vulnerable packages"
        tone={worst === 'critical' || worst === 'high' ? 'error' : worst ? 'warning' : 'good'}
        value={number(packages.length)}
        link={link}
      >
        {packages.length === 0
          ? 'No known advisories for the installed versions'
          : (['critical', 'high', 'moderate', 'low'] as const)
              .filter((s) => summary[s] > 0)
              .map((s) => `${String(summary[s])} ${s}`)
              .join(' · ')}
      </HealthCell>
    );
  }
  return (
    <HealthCell
      label="Vulnerable packages"
      tone="plain"
      value={state.status === 'running' ? '…' : '—'}
      link={link}
    >
      {state.status === 'error' ? (
        'The check failed; see Vulnerabilities'
      ) : state.status === 'running' ? (
        'Checking the installed packages…'
      ) : audit.canRun ? (
        <span className="cell-action">
          <button type="button" className="button small" onClick={audit.run}>
            <Icon name="bug" size={14} />
            Check dependencies
          </button>
          <span className="visually-hidden">
            <AuditConsent />
          </span>
        </span>
      ) : (
        'Not checked'
      )}
    </HealthCell>
  );
}

/** The signature move: a finding opens in place into what it breaks and how to fix it. */
export function FixList({ findings, hasGraph }: { findings: Finding[]; hasGraph: boolean }) {
  const [open, setOpen] = useState<string | null>(findings[0]?.id ?? null);
  return (
    <ol className="fix-list" aria-label="Violations to fix first">
      {findings.map((finding) => {
        const expanded = open === finding.id;
        return (
          <li key={finding.id} className={`fix-item${expanded ? ' open' : ''}`}>
            <button
              type="button"
              className="fix-summary"
              aria-expanded={expanded}
              onClick={() => {
                setOpen(expanded ? null : finding.id);
              }}
            >
              <SeverityBadge severity={finding.severity} />
              <span className="mono fix-where">
                {finding.file === null
                  ? 'no file recorded'
                  : location(finding.file, finding.line, finding.column)}
              </span>
              <code className="fix-rule">
                <Breakable text={finding.ruleId} />
              </code>
              {finding.baselineStatus && <BaselineBadge status={finding.baselineStatus} />}
              <Icon name="chevronDown" size={16} />
            </button>
            {expanded && (
              <div className="fix-body">
                <p>{revealControls(finding.message)}</p>
                {finding.suggestion ? (
                  <p className="fix-line">
                    <Icon name="fix" size={16} />
                    <span>{revealControls(finding.suggestion)}</span>
                  </p>
                ) : (
                  <p className="muted">
                    This document does not include a suggested fix (made before DepTrace 0.6.0, or
                    from SARIF).
                  </p>
                )}
                <p className="button-row">
                  <a className="button small" href={href('violations', { finding: finding.id })}>
                    Details
                  </a>
                  {hasGraph && (
                    <a className="button small" href={href('graph', { finding: finding.id })}>
                      <Icon name="graph" size={14} /> Show in graph
                    </a>
                  )}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Layers with their sizes, then every layer-to-layer direction, broken ones first. */
function LayerPanel({ model }: { model: Model }) {
  if (!hasLayers(model)) {
    return (
      <section className="panel" aria-labelledby="layers-title">
        <header className="panel-head">
          <h2 id="layers-title">Layers</h2>
        </header>
        <EmptyState title="No layers configured">
          <p>
            Layers group files by glob in deptrace.yml (for example <code>src/domain/**</code>). Run{' '}
            <code>deptrace init --detect</code> to get a suggestion.
          </p>
        </EmptyState>
      </section>
    );
  }
  const layerOf = (file: string | null) => {
    const index = file === null ? undefined : model.byId.get(file);
    return index === undefined ? null : model.modules[index]?.layer;
  };
  const broken = new Map<string, number>();
  for (const finding of model.findings) {
    if (finding.ruleId !== 'layer-boundaries' || finding.target?.kind !== 'file') continue;
    const key = `${layerOf(finding.file) ?? ''}\0${layerOf(finding.target.path) ?? ''}`;
    broken.set(key, (broken.get(key) ?? 0) + 1);
  }
  const directions = model.report.architecture.layerDependencies
    .map((d) => ({ ...d, broken: broken.get(`${d.from}\0${d.to}`) ?? 0 }))
    .sort((a, b) => b.broken - a.broken || b.edges - a.edges);
  const largest = Math.max(1, ...model.layers.map((layer) => layer.modules.length));
  return (
    <section className="panel" aria-labelledby="layers-title">
      <header className="panel-head">
        <h2 id="layers-title">Layers</h2>
        <a className="panel-link" href={href('layers')}>
          Matrix <Icon name="arrowRight" size={14} />
        </a>
      </header>
      <ul className="layer-stack" aria-label="Files per layer">
        {model.layers.map((layer) => (
          <li key={layer.name}>
            <a href={href('layers', { layer: layer.name })}>
              <span className="swatch" data-slot={layer.slot ?? 'none'} aria-hidden="true" />
              {layer.name}
            </a>
            <span
              className="layer-bar"
              data-slot={layer.slot ?? 'none'}
              style={{ inlineSize: `${String((layer.modules.length / largest) * 100)}%` }}
              aria-hidden="true"
            />
            <span className="mono">{number(layer.modules.length)}</span>
          </li>
        ))}
      </ul>
      <h3 className="label">Directions between layers</h3>
      <ul className="direction-list" aria-label="Imports between layers">
        {directions.slice(0, 8).map((d) => (
          <li key={`${d.from}>${d.to}`} className={d.broken > 0 ? 'broken' : undefined}>
            <span className="mono">
              {d.from} <Icon name="arrowRight" size={12} /> {d.to}
            </span>
            <span className="muted">{plural(d.edges, 'import')}</span>
            {d.broken > 0 && (
              <span className="badge severity-error">{plural(d.broken, 'violation')}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ledgerRows(model: Model, rules: number, errors: number, warnings: number): LedgerRow[] {
  const { summary } = model.report;
  const builtins = model.packages.filter((p) => p.builtin).length;
  return [
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
      detail: `${plural(summary.internalReferences, 'import statement')}, ${number(summary.typeOnlyEdges)} ${TYPE_ONLY}`,
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
      detail: summary.unresolvedReferences > 0 ? 'not checked by rules' : 'every import resolved',
    },
    hasLayers(model)
      ? {
          label: 'Unclassified files',
          value: model.unclassified.length,
          detail: `in no layer of ${plural(model.layers.length, 'layer')}`,
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
      detail: `${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')}`,
    },
  ];
}
