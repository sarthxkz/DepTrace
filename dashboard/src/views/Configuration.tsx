import { Breakable, SeverityBadge } from '../components/ui';
import type { Model } from '../model/model';

const List = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length === 0 ? (
    <span className="muted">{empty}</span>
  ) : (
    <ul className="inline-list">
      {items.map((item) => (
        <li key={item}>
          <code>{item}</code>
        </li>
      ))}
    </ul>
  );

/** What the analysis was configured with, as recorded in the report (read-only). */
export function Configuration({ model }: { model: Model }) {
  const { settings, architecture } = model.report;
  return (
    <div className="page configuration">
      <h1>Configuration</h1>
      <p className="lede">
        As recorded in the report. Change it in <code>{settings.configFile ?? 'deptrace.yml'}</code>{' '}
        and re-analyze.
      </p>
      <section className="panel" aria-labelledby="analysis-settings">
        <h2 id="analysis-settings">Analysis</h2>
        <dl className="facts">
          <dt>Configuration file</dt>
          <dd>{settings.configFile ? <code>{settings.configFile}</code> : 'none (defaults)'}</dd>
          <dt>Include</dt>
          <dd>
            <List items={settings.include} empty="none" />
          </dd>
          <dt>Exclude</dt>
          <dd>
            <List items={settings.exclude} empty="none" />
          </dd>
          <dt>Always excluded</dt>
          <dd>
            <List
              items={[
                ...settings.builtinExcludedDirectories.map((d) => `${d}/`),
                ...settings.builtinExcludedFiles,
              ]}
              empty="none"
            />
          </dd>
          <dt>Extensions</dt>
          <dd>
            <List items={settings.extensions} empty="none" />
          </dd>
          <dt>tsconfig files</dt>
          <dd>
            <List items={settings.tsconfigs} empty="none found (default resolution)" />
          </dd>
        </dl>
      </section>
      <section className="panel" aria-labelledby="rules-settings">
        <h2 id="rules-settings">Rules</h2>
        {architecture.rules.length === 0 ? (
          <p className="muted">No rules configured.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Enforces</th>
                  <th scope="col" className="numeric">
                    Violations
                  </th>
                </tr>
              </thead>
              <tbody>
                {architecture.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <code>
                        <Breakable text={rule.id} />
                      </code>
                    </td>
                    <td>
                      <SeverityBadge severity={rule.severity} />
                    </td>
                    <td>{rule.description}</td>
                    <td className="numeric">{rule.severity === 'off' ? '—' : rule.violations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
