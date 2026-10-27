import { useRef, useState, type DragEvent } from 'react';
import type { Ready } from '../lib/state';
import { Icon } from '../components/Icon';
import { Notice } from '../components/ui';
import { MAX_REPORT_BYTES } from '../contract/load';
import { SUPPORTED_SCHEMA_VERSION } from '../contract/report';
import { formatTime } from '../lib/format';

type ImportResult = { message: string; problems: string[] } | null;

export function Reports({
  ready,
  onImport,
}: {
  ready: Ready | null;
  onImport: (file: File) => Promise<ImportResult>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<{
    name: string;
    message: string;
    problems: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setFailure(null);
    const result = await onImport(file);
    setLoading(false);
    if (result) setFailure({ name: file.name, ...result });
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void load(event.dataTransfer.files[0]);
  };

  const loaded = ready?.loaded;
  const source = ready?.source;
  return (
    <div className="page reports">
      <h1>Reports</h1>

      <section className="panel" aria-labelledby="current-title">
        <h2 id="current-title">Loaded document</h2>
        {!loaded || !source ? (
          <p className="muted">Nothing is loaded.</p>
        ) : (
          <dl className="facts">
            <dt>Source</dt>
            <dd>
              {source.kind === 'file'
                ? `Imported file ${source.name} (read in this browser; nothing was uploaded)`
                : source.meta.source === 'file'
                  ? `Report file ${source.meta.name}, served by "deptrace dashboard --report"`
                  : `Live analysis of ${source.meta.name || 'the repository'} by "deptrace dashboard"`}
            </dd>
            <dt>Format</dt>
            <dd>
              {loaded.kind === 'report'
                ? `DepTrace report, schema version ${String(loaded.report.schemaVersion)}`
                : loaded.format === 'sarif'
                  ? 'SARIF 2.1.0 log (findings only)'
                  : 'DepTrace check report (findings only)'}
            </dd>
            <dt>Produced by</dt>
            <dd>
              {loaded.kind === 'report'
                ? `${loaded.report.tool.name} ${loaded.report.tool.version}`
                : `${loaded.tool.name || 'unknown tool'}${loaded.tool.version ? ` ${loaded.tool.version}` : ''}`}
            </dd>
            {source.kind === 'server' && source.meta.analyzedAt && (
              <>
                <dt>Analyzed</dt>
                <dd>{formatTime(source.meta.analyzedAt)}</dd>
              </>
            )}
            {loaded.kind === 'report' && (
              <>
                <dt>Analysis status</dt>
                <dd>{loaded.report.status}</dd>
                <dt>Repository</dt>
                <dd>
                  {loaded.report.repository.packageName
                    ? `${loaded.report.repository.packageName}${loaded.report.repository.packageVersion ? ` ${loaded.report.repository.packageVersion}` : ''}`
                    : 'no package.json name'}
                  {loaded.report.repository.git ? ', Git repository' : ''}
                </dd>
              </>
            )}
          </dl>
        )}
      </section>

      <section className="panel" aria-labelledby="import-title">
        <h2 id="import-title">Import a report</h2>
        <div
          className={`drop-zone${dragging ? ' dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={drop}
        >
          <Icon name="upload" size={22} />
          <p>
            Drop a JSON or SARIF file here, or{' '}
            <button
              type="button"
              className="button primary"
              onClick={() => input.current?.click()}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Reading…' : 'Choose a file'}
            </button>
          </p>
          <input
            ref={input}
            type="file"
            accept=".json,.sarif,application/json"
            className="visually-hidden"
            aria-label="Report file"
            tabIndex={-1}
            onChange={(event) => {
              void load(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <p className="muted">
            The file is read and validated in this browser; nothing is sent anywhere. Limit:{' '}
            {String(MAX_REPORT_BYTES / 1024 / 1024)} MB.
          </p>
        </div>
        {failure && (
          <Notice tone="error">
            <p>
              <strong>{failure.name}</strong> was not loaded: {failure.message}
            </p>
            {failure.problems.length > 0 && (
              <ul className="problem-list">
                {failure.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            {ready && <p>The previous document is still shown.</p>}
          </Notice>
        )}
      </section>

      <section className="panel" aria-labelledby="formats-title">
        <h2 id="formats-title">Supported documents</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Create it with</th>
                <th scope="col">Shows</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>DepTrace report (schema version {SUPPORTED_SCHEMA_VERSION})</td>
                <td>
                  <code>deptrace report --format json &gt; report.json</code>
                  <br />
                  <code>deptrace report --format json --baseline deptrace-baseline.json</code>
                </td>
                <td>Everything: graph, layers, cycles, modules, violations, baseline status</td>
              </tr>
              <tr>
                <td>DepTrace check report</td>
                <td>
                  <code>deptrace check --report check.json</code> (the CI artifact)
                </td>
                <td>Violations and baseline status only</td>
              </tr>
              <tr>
                <td>SARIF 2.1.0</td>
                <td>
                  <code>deptrace check --sarif deptrace.sarif</code>
                </td>
                <td>Findings only (locations, fingerprints, baseline state)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">History</h2>
        <p>
          DepTrace does not store analysis snapshots, so the dashboard shows one report at a time
          and no trends. To compare over time, keep report files (for example as CI artifacts) and
          import them one by one.
        </p>
      </section>
    </div>
  );
}
