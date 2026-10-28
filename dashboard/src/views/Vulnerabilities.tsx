import { useState } from 'react';
import { Icon } from '../components/Icon';
import { CopyButton, EmptyState, ModuleLink, Notice } from '../components/ui';
import type { AuditSeverity, VulnerablePackage } from '../contract/audit';
import { SEVERITIES } from '../contract/audit';
import { number, plural } from '../lib/format';
import type { AuditControl, Ready } from '../lib/state';

const RANKED = [...SEVERITIES].reverse();

export function AuditSeverityBadge({ severity }: { severity: AuditSeverity }) {
  return <span className={`badge audit-${severity}`}>{severity}</span>;
}

/** The consent line shown before anything leaves the machine. */
export function AuditConsent() {
  return (
    <p className="muted">
      Sends the package names and versions in <code>package-lock.json</code> to the npm registry
      (registry.npmjs.org), the service <code>npm audit</code> uses. No source code, and nothing for
      private, git or local packages.
    </p>
  );
}

export function Vulnerabilities({ ready, audit }: { ready: Ready; audit: AuditControl }) {
  const { state } = audit;
  const hasGraph = ready.model !== null;
  return (
    <div className="page">
      <div className="page-head">
        <h1>Vulnerabilities</h1>
        <div className="button-row">
          {audit.canRun && (
            <button
              type="button"
              className="button primary"
              onClick={audit.run}
              disabled={state.status === 'running'}
              aria-busy={state.status === 'running'}
            >
              <Icon name="bug" />
              {state.status === 'running'
                ? 'Checking…'
                : state.status === 'done'
                  ? 'Check again'
                  : 'Check dependencies'}
            </button>
          )}
          <label className="button">
            <Icon name="upload" />
            Open audit file
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) audit.load(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      <p className="lede">
        Known security advisories for the npm packages installed in this repository, which of your
        files import each one, and the update that fixes it. These are vulnerabilities in
        dependencies, not in your own code, and not architecture violations.
      </p>

      {state.status === 'idle' && (
        <EmptyState title="Dependencies have not been checked" icon="bug">
          {audit.canRun ? (
            <AuditConsent />
          ) : (
            <p>
              This dashboard shows a report file, so it cannot run the check. Run{' '}
              <code>deptrace audit --format json &gt; audit.json</code> in the repository and open
              the file here.
            </p>
          )}
        </EmptyState>
      )}
      {state.status === 'running' && (
        <p role="status" className="muted">
          Looking up advisories for the installed packages…
        </p>
      )}
      {state.status === 'error' && (
        <Notice tone="error">
          <p>{state.message}</p>
          {state.problems.length > 0 && (
            <ul className="problem-list">
              {state.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      {state.status === 'done' && (
        <AuditResult
          packages={state.report.packages}
          summary={state.report.summary}
          sent={state.report.packageVersionsSent}
          notChecked={state.report.packagesNotChecked}
          source={state.origin === 'file' ? state.name : state.report.registry}
          hasGraph={hasGraph}
        />
      )}
    </div>
  );
}

function AuditResult({
  packages,
  summary,
  sent,
  notChecked,
  source,
  hasGraph,
}: {
  packages: VulnerablePackage[];
  summary: Record<AuditSeverity, number>;
  sent: number;
  notChecked: number;
  source: string;
  hasGraph: boolean;
}) {
  const [open, setOpen] = useState<string | null>(packages[0]?.path ?? null);
  return (
    <>
      <h2 className="label">Packages by their most severe advisory</h2>
      <dl className="strip" aria-label="Packages by their most severe advisory">
        {RANKED.slice(0, 4).map((severity) => (
          <div
            key={severity}
            className={`strip-cell${summary[severity] > 0 ? ` tone-${severity}` : ''}`}
          >
            <dt>{severity}</dt>
            <dd>{number(summary[severity])}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        {plural(sent, 'package version')} checked against {source}
        {notChecked > 0 && `; ${plural(notChecked, 'package')} from other sources not checked`}.
      </p>
      {packages.length === 0 ? (
        <EmptyState title="No known vulnerabilities in the installed versions" icon="check">
          <p>
            This covers advisories published for the exact versions in the lockfile today; it does
            not inspect your own code.
          </p>
        </EmptyState>
      ) : (
        <ol className="fix-list" aria-label="Vulnerable packages">
          {packages.map((pkg) => {
            const expanded = open === pkg.path;
            return (
              <li key={pkg.path} className={`fix-item${expanded ? ' open' : ''}`}>
                <button
                  type="button"
                  className="fix-summary"
                  aria-expanded={expanded}
                  onClick={() => {
                    setOpen(expanded ? null : pkg.path);
                  }}
                >
                  <AuditSeverityBadge severity={pkg.severity} />
                  <span className="mono fix-where">
                    {pkg.name}@{pkg.version}
                  </span>
                  <span className="fix-rule">
                    {plural(pkg.advisories.length, 'advisory', 'advisories')}
                  </span>
                  <span className="tag">{pkg.direct ? 'direct' : 'transitive'}</span>
                  {pkg.dev && <span className="tag">dev</span>}
                  <Icon name="chevronDown" size={16} />
                </button>
                {expanded && <PackageDetail pkg={pkg} hasGraph={hasGraph} />}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function PackageDetail({ pkg, hasGraph }: { pkg: VulnerablePackage; hasGraph: boolean }) {
  return (
    <div className="fix-body">
      <div className="fix-line">
        <Icon name="fix" size={16} />
        <div>
          {pkg.fix.command ? (
            <p className="fix-command">
              <code>{pkg.fix.command}</code>
              <CopyButton value={pkg.fix.command} label="Copy command" />
            </p>
          ) : null}
          <p>
            {pkg.fix.version && !pkg.fix.command && (
              <>
                Fixed in <code>{pkg.fix.version}</code>.{' '}
              </>
            )}
            {pkg.fix.note}
          </p>
        </div>
      </div>
      <h3 className="label">Advisories</h3>
      <ul className="advisory-list">
        {pkg.advisories.map((advisory) => (
          <li key={advisory.id}>
            <AuditSeverityBadge severity={advisory.severity} />
            <a href={advisory.url} target="_blank" rel="noreferrer noopener">
              {advisory.title}
            </a>
            <span className="mono muted">vulnerable {advisory.vulnerableVersions}</span>
          </li>
        ))}
      </ul>
      <h3 className="label">Imported by your code</h3>
      {pkg.importedBy.length === 0 ? (
        <p className="muted">
          No analyzed source file imports <code>{pkg.name}</code> by name; another package, a script
          or a tool uses it.
        </p>
      ) : (
        <ul className="ref-list">
          {pkg.importedBy.map((ref) => (
            <li key={`${ref.file}:${String(ref.line)}`}>
              {hasGraph ? <ModuleLink id={ref.file} /> : <span className="mono">{ref.file}</span>}
              <span className="ref">
                {ref.line}:{ref.column}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted mono">Installed at {pkg.path}</p>
    </div>
  );
}
