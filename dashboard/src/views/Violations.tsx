import { useMemo, useState } from 'react';
import type { Ready } from '../lib/state';
import { Icon } from '../components/Icon';
import {
  BaselineBadge,
  CardSection,
  CatalogCard,
  CopyButton,
  EmptyState,
  ModuleLink,
  Pager,
  PathChain,
  SeverityBadge,
} from '../components/ui';
import type { Finding } from '../contract/load';
import type { BaselineEntry, Target } from '../contract/report';
import { location, plural } from '../lib/format';
import { href, navigate } from '../lib/router';

const PAGE_SIZE = 50;
const SEVERITY_ORDER = { error: 0, warning: 1, note: 2 } as const;
type SortKey = 'severity' | 'file' | 'rule';

function targetText(target: Target | null): string {
  if (!target) return '';
  if (target.kind === 'file') return target.path;
  if (target.kind === 'package') return target.name;
  return `cycle of ${String(target.files.length)} files`;
}

function TargetView({ target, linked }: { target: Target | null; linked: boolean }) {
  if (!target) return <span className="muted">not recorded</span>;
  if (target.kind === 'file')
    return linked ? <ModuleLink id={target.path} /> : <span className="mono">{target.path}</span>;
  if (target.kind === 'package') {
    return (
      <span className="mono">
        <Icon name="package" size={14} /> {target.name}
        {!target.resolved && <span className="tag">not installed</span>}
      </span>
    );
  }
  return <span>cycle of {plural(target.files.length, 'file')}</span>;
}

export function Violations({ ready, params }: { ready: Ready; params: URLSearchParams }) {
  const { loaded, model } = ready;
  const findings = loaded.findings;
  const baseline = loaded.kind === 'report' ? loaded.report.architecture.baseline : loaded.baseline;
  const hasBaseline = findings.some((f) => f.baselineStatus !== null);
  const rules = useMemo(() => [...new Set(findings.map((f) => f.ruleId))].sort(), [findings]);

  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState(params.get('severity') ?? '');
  const [rule, setRule] = useState(params.get('rule') ?? '');
  const [status, setStatus] = useState(params.get('baseline') ?? '');
  const [module, setModule] = useState(params.get('module') ?? '');
  const [sort, setSort] = useState<SortKey>('severity');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const m = module.trim().toLowerCase();
    const filtered = findings.filter(
      (f) =>
        (severity === '' || f.severity === severity) &&
        (rule === '' || f.ruleId === rule) &&
        (status === '' || f.baselineStatus === status) &&
        (m === '' ||
          (f.file ?? '').toLowerCase().includes(m) ||
          targetText(f.target).toLowerCase().includes(m) ||
          (f.target?.kind === 'cycle' &&
            f.target.files.some((file) => file.toLowerCase().includes(m)))) &&
        (q === '' ||
          [f.ruleId, f.message, f.file ?? '', targetText(f.target), f.fingerprint ?? ''].some(
            (text) => text.toLowerCase().includes(q),
          )),
    );
    const byFile = (a: Finding, b: Finding) =>
      (a.file ?? '') < (b.file ?? '')
        ? -1
        : (a.file ?? '') > (b.file ?? '')
          ? 1
          : (a.line ?? 0) - (b.line ?? 0);
    return filtered.sort((a, b) => {
      if (sort === 'severity')
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || byFile(a, b);
      if (sort === 'rule') return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : byFile(a, b);
      return byFile(a, b);
    });
  }, [findings, query, severity, rule, status, module, sort]);

  const selectedId = params.get('finding');
  const selected =
    selectedId === null
      ? undefined
      : (model?.findingById.get(selectedId) ?? findings.find((f) => f.id === selectedId));
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const reset = () => {
    setQuery('');
    setSeverity('');
    setRule('');
    setStatus('');
    setModule('');
    setPage(0);
  };
  const filtered = query !== '' || severity !== '' || rule !== '' || status !== '' || module !== '';
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  return (
    <div className={`page split${selectedId !== null ? ' has-detail' : ''}`}>
      <div className="split-main">
        <h1>Violations</h1>
        <p className="lede">
          {findings.length === 0
            ? 'No violations in this report.'
            : `${plural(errors, 'error')} and ${plural(warnings, 'warning')}${findings.length - errors - warnings > 0 ? `, ${plural(findings.length - errors - warnings, 'note')}` : ''}.`}
          {baseline &&
            ` Compared with ${baseline.file}: ${plural(baseline.new, 'new violation')}, ${String(baseline.existing)} accepted, ${String(baseline.resolved)} resolved.`}
          {!hasBaseline && findings.length > 0 && ' No baseline comparison in this report.'}
        </p>

        {findings.length > 0 && (
          <div className="filters" role="search">
            <label className="field grow">
              <span>Search</span>
              <input
                type="search"
                value={query}
                placeholder="Rule, message, file or fingerprint"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="field">
              <span>Severity</span>
              <select
                value={severity}
                onChange={(event) => {
                  setSeverity(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                {findings.some((f) => f.severity === 'note') && <option value="note">Notes</option>}
              </select>
            </label>
            <label className="field">
              <span>Rule</span>
              <select
                value={rule}
                onChange={(event) => {
                  setRule(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All rules</option>
                {rules.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            {hasBaseline && (
              <label className="field">
                <span>Baseline</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All</option>
                  <option value="new">New</option>
                  <option value="existing">Accepted</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>Module</span>
              <input
                type="search"
                value={module}
                placeholder="Path"
                onChange={(event) => {
                  setModule(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="field">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                }}
              >
                <option value="severity">Severity</option>
                <option value="file">File</option>
                <option value="rule">Rule</option>
              </select>
            </label>
            {filtered && (
              <button type="button" className="button ghost" onClick={reset}>
                <Icon name="reset" /> Reset filters
              </button>
            )}
          </div>
        )}

        {findings.length === 0 ? (
          <EmptyState title="No violations" icon="check">
            <p>
              The configured rules found nothing. Rules only check what they are configured for and
              only see resolved static imports.
            </p>
          </EmptyState>
        ) : (
          <>
            <p className="result-count" role="status">
              {plural(rows.length, 'violation')}
              {rows.length !== findings.length && ` of ${String(findings.length)}`}
            </p>
            {rows.length === 0 ? (
              <EmptyState title="No violations match">
                <p>Change or reset the filters.</p>
              </EmptyState>
            ) : (
              <ol className="violation-list">
                {visible.map((finding) => (
                  <li key={finding.id}>
                    <a
                      className={`violation-item${finding.id === selectedId ? ' selected' : ''}`}
                      href={href('violations', { finding: finding.id })}
                      aria-current={finding.id === selectedId ? 'true' : undefined}
                    >
                      <span className="violation-head">
                        <SeverityBadge severity={finding.severity} />
                        {finding.baselineStatus && (
                          <BaselineBadge status={finding.baselineStatus} />
                        )}
                        <code>{finding.ruleId}</code>
                      </span>
                      <span className="violation-where mono">
                        {location(finding.file, finding.line, finding.column) || 'no location'}
                        {finding.target && (
                          <>
                            {' '}
                            <span className="chain-step">→</span> {targetText(finding.target)}
                          </>
                        )}
                      </span>
                      <span className="violation-message">{finding.message}</span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />
          </>
        )}

        {baseline && baseline.resolvedViolations.length > 0 && (
          <section className="resolved" aria-labelledby="resolved-title">
            <h2 id="resolved-title">Resolved baseline entries</h2>
            <p className="muted">
              Accepted in <code>{baseline.file}</code> but no longer found. Remove them with{' '}
              <code>deptrace baseline update</code> so the same violation cannot return unnoticed.
            </p>
            <ul className="resolved-list">
              {baseline.resolvedViolations.map((entry: BaselineEntry) => (
                <li key={entry.fingerprint}>
                  <BaselineBadge status="resolved" />
                  <code>{entry.ruleId}</code>
                  <span className="mono">
                    {entry.file} → {targetText(entry.target)}
                  </span>
                  <span className="muted mono">{entry.fingerprint}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {selectedId !== null && (
        <aside className="split-detail" aria-label="Selected violation">
          <button
            type="button"
            className="button ghost small close-detail"
            onClick={() => {
              navigate('violations');
            }}
          >
            Close
          </button>
          {selected ? (
            <FindingCard finding={selected} hasGraph={model !== null} />
          ) : (
            <EmptyState title="Violation not found">
              <p>No violation with this identifier is in the loaded report.</p>
            </EmptyState>
          )}
        </aside>
      )}
    </div>
  );
}

function FindingCard({ finding, hasGraph }: { finding: Finding; hasGraph: boolean }) {
  return (
    <CatalogCard
      label={`Violation of ${finding.ruleId}`}
      title={<code>{finding.ruleId}</code>}
      meta={
        <>
          <SeverityBadge severity={finding.severity} />
          {finding.baselineStatus && <BaselineBadge status={finding.baselineStatus} />}
          {finding.typeOnly && <span className="tag">type-only imports</span>}
        </>
      }
      actions={
        hasGraph ? (
          <a className="button small" href={href('graph', { finding: finding.id })}>
            <Icon name="graph" /> Show in graph
          </a>
        ) : undefined
      }
    >
      <CardSection title="What it breaks">
        <p>{finding.message}</p>
        {finding.ruleDescription && <p className="muted">Rule: {finding.ruleDescription}</p>}
      </CardSection>
      <CardSection title="Where">
        <dl className="facts">
          <dt>Source</dt>
          <dd>
            {finding.file === null ? (
              <span className="muted">not recorded</span>
            ) : hasGraph ? (
              <ModuleLink id={finding.file} />
            ) : (
              <span className="mono">{finding.file}</span>
            )}
          </dd>
          <dt>Location</dt>
          <dd className="mono">
            {finding.line === null ? (
              <span className="muted">no line recorded</span>
            ) : (
              location(finding.file, finding.line, finding.column)
            )}
          </dd>
          <dt>Target</dt>
          <dd>
            <TargetView target={finding.target} linked={hasGraph} />
          </dd>
        </dl>
      </CardSection>
      {finding.references.length > 0 && (
        <CardSection title="Imports that cause it" count={finding.references.length}>
          <ul className="ref-list">
            {finding.references.map((ref, index) => (
              <li key={index}>
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
      )}
      {finding.path && finding.path.length > 1 && (
        <CardSection title="Dependency path">
          <PathChain ids={finding.path} closed={finding.target?.kind === 'cycle'} />
        </CardSection>
      )}
      {finding.target?.kind === 'cycle' && (
        <CardSection title="Files in the cycle" count={finding.target.files.length}>
          <ul className="ref-list">
            {finding.target.files.map((file) => (
              <li key={file}>
                {hasGraph ? <ModuleLink id={file} /> : <span className="mono">{file}</span>}
              </li>
            ))}
          </ul>
        </CardSection>
      )}
      <CardSection title="Fingerprint">
        {finding.fingerprint ? (
          <p className="fingerprint">
            <code>{finding.fingerprint}</code>{' '}
            <CopyButton value={finding.fingerprint} label="Copy" />
          </p>
        ) : (
          <p className="muted">Not recorded in this document.</p>
        )}
        <p className="muted">
          {finding.baselineStatus === null
            ? 'No baseline comparison in this report.'
            : finding.baselineStatus === 'new'
              ? 'Not in the baseline: this violation fails "deptrace check --baseline".'
              : 'Accepted by the baseline: it does not fail "deptrace check --baseline".'}
        </p>
      </CardSection>
    </CatalogCard>
  );
}
