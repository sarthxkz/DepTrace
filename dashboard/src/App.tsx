import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { Notice, Skeleton } from './components/ui';
import { LoadError, parseValue, readDocumentFile, type Loaded } from './contract/load';
import { fetchReport, reanalyze, ServerError } from './lib/api';
import { formatTime } from './lib/format';
import { href, useRoute, type Page } from './lib/router';
import type { Ready, Source } from './lib/state';
import { useTheme, type ThemeChoice } from './lib/theme';
import { buildModel } from './model/model';
import { Configuration } from './views/Configuration';
import { Cycles } from './views/Cycles';
import { GraphView } from './views/GraphView';
import { Layers } from './views/Layers';
import { Modules } from './views/Modules';
import { Overview } from './views/Overview';
import { Reports } from './views/Reports';
import { Violations } from './views/Violations';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; problems: string[]; noServer: boolean }
  | ({ status: 'ready' } & Ready);

const NAV: { page: Page; label: string; icon: IconName; needsGraph: boolean }[] = [
  { page: 'overview', label: 'Overview', icon: 'overview', needsGraph: false },
  { page: 'graph', label: 'Dependency graph', icon: 'graph', needsGraph: true },
  { page: 'layers', label: 'Layers', icon: 'layers', needsGraph: true },
  { page: 'violations', label: 'Violations', icon: 'violations', needsGraph: false },
  { page: 'cycles', label: 'Cycles', icon: 'cycles', needsGraph: true },
  { page: 'modules', label: 'Modules', icon: 'modules', needsGraph: true },
  { page: 'reports', label: 'Reports', icon: 'reports', needsGraph: false },
  { page: 'configuration', label: 'Configuration', icon: 'configuration', needsGraph: true },
];

function toReady(loaded: Loaded, source: Source): Ready {
  return {
    loaded,
    model: loaded.kind === 'report' ? buildModel(loaded.report, loaded.findings) : null,
    source,
  };
}

async function loadFromServer(): Promise<State> {
  try {
    const server = await fetchReport();
    const loaded = parseValue(server.report);
    return {
      status: 'ready',
      ...toReady(loaded, { kind: 'server', meta: server.meta, live: server.live }),
    };
  } catch (error) {
    return {
      status: 'error',
      message: messageOf(error),
      problems: problemsOf(error),
      noServer: error instanceof ServerError && error.unreachable,
    };
  }
}

const problemsOf = (error: unknown) => (error instanceof LoadError ? error.problems : []);
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function App() {
  const route = useRoute();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    let current = true;
    void loadFromServer().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, []);

  const runAnalysis = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const server = await reanalyze();
      const loaded = parseValue(server.report);
      setState({
        status: 'ready',
        ...toReady(loaded, { kind: 'server', meta: server.meta, live: server.live }),
      });
      setNotice({ tone: 'info', text: 'Analysis updated.' });
    } catch (error) {
      setNotice({ tone: 'error', text: `Re-analysis failed: ${messageOf(error)}` });
    } finally {
      setBusy(false);
    }
  };

  /** Imports a file; returns problems for the Reports page to show. */
  const importFile = async (
    file: File,
  ): Promise<{ message: string; problems: string[] } | null> => {
    try {
      const loaded = await readDocumentFile(file);
      setState({ status: 'ready', ...toReady(loaded, { kind: 'file', name: file.name }) });
      setNotice({ tone: 'info', text: `Loaded ${file.name}.` });
      return null;
    } catch (error) {
      return { message: messageOf(error), problems: problemsOf(error) };
    }
  };

  const ready = state.status === 'ready' ? state : null;
  const findingsOnly = ready !== null && ready.model === null;

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="rail" aria-label="Sections">
        <div className="rail-brand">
          <span className="brand-mark" aria-hidden="true" />
          deptrace
        </div>
        {/* On small screens the rail is a drawer; following a link closes it. */}
        <ul
          onClick={() => {
            setNavOpen(false);
          }}
        >
          {NAV.map((item) => (
            <li key={item.page}>
              <a
                href={href(item.page)}
                aria-current={route.page === item.page ? 'page' : undefined}
                className={findingsOnly && item.needsGraph ? 'unavailable' : undefined}
              >
                <Icon name={item.icon} />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <ThemeSwitch choice={theme} onChange={setTheme} />
      </nav>
      <div className="main-column">
        <Header
          ready={ready}
          busy={busy}
          onAnalyze={() => void runAnalysis()}
          onMenu={() => {
            setNavOpen((open) => !open);
          }}
          navOpen={navOpen}
        />
        <main id="main" tabIndex={-1}>
          {notice && (
            <div className="toast-row">
              <Notice tone={notice.tone}>
                {notice.text}{' '}
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => {
                    setNotice(null);
                  }}
                >
                  Dismiss
                </button>
              </Notice>
            </div>
          )}
          {state.status === 'loading' && <LoadingPage />}
          {state.status === 'error' &&
            (route.page === 'reports' ? (
              <Reports ready={null} onImport={importFile} />
            ) : (
              <ErrorPage
                state={state}
                onRetry={() => {
                  setState({ status: 'loading' });
                  void loadFromServer().then(setState);
                }}
              />
            ))}
          {ready && (
            <PageView page={route.page} params={route.params} ready={ready} onImport={importFile} />
          )}
        </main>
      </div>
    </div>
  );
}

function PageView({
  page,
  params,
  ready,
  onImport,
}: {
  page: Page;
  params: URLSearchParams;
  ready: Ready;
  onImport: (file: File) => Promise<{ message: string; problems: string[] } | null>;
}) {
  const { model } = ready;
  const unavailable = useMemo(() => {
    const item = NAV.find((entry) => entry.page === page);
    return item?.needsGraph === true && model === null;
  }, [page, model]);
  if (page === 'reports') return <Reports ready={ready} onImport={onImport} />;
  if (page === 'overview') return <Overview ready={ready} />;
  if (page === 'violations') return <Violations ready={ready} params={params} />;
  if (unavailable || model === null) {
    const label = NAV.find((entry) => entry.page === page)?.label ?? page;
    return (
      <div className="page">
        <h1>{label}</h1>
        <Notice>
          This document only contains findings (
          {ready.loaded.kind === 'findings'
            ? ready.loaded.format === 'sarif'
              ? 'a SARIF log'
              : 'a check report'
            : ''}
          ), not a dependency graph, so
          {` ${label.toLowerCase()} `}cannot be shown. Load a full report made with{' '}
          <code>deptrace report --format json</code> on the <a href={href('reports')}>Reports</a>{' '}
          page.
        </Notice>
      </div>
    );
  }
  switch (page) {
    case 'graph':
      return <GraphView model={model} params={params} />;
    case 'layers':
      return <Layers model={model} params={params} />;
    case 'cycles':
      return <Cycles model={model} params={params} />;
    case 'modules':
      return <Modules model={model} params={params} />;
    case 'configuration':
      return <Configuration model={model} />;
  }
}

function Header({
  ready,
  busy,
  onAnalyze,
  onMenu,
  navOpen,
}: {
  ready: Ready | null;
  busy: boolean;
  onAnalyze: () => void;
  onMenu: () => void;
  navOpen: boolean;
}) {
  const report = ready?.loaded.kind === 'report' ? ready.loaded.report : null;
  const source = ready?.source;
  const name =
    report?.repository.packageName ??
    (source?.kind === 'server' ? source.meta.name : source?.kind === 'file' ? source.name : null) ??
    'DepTrace';
  const tool = ready?.loaded.kind === 'report' ? ready.loaded.report.tool : ready?.loaded.tool;
  const git = source?.kind === 'server' ? source.meta.git : null;
  return (
    <header className="topbar">
      <button
        type="button"
        className="button ghost menu-button"
        aria-expanded={navOpen}
        aria-label="Sections"
        onClick={onMenu}
      >
        <Icon name="menu" size={18} />
      </button>
      <div className="project">
        <p className="project-name">{name}</p>
        {ready && (
          <dl className="project-facts">
            {report && (
              <div>
                <dt>Analysis</dt>
                <dd>
                  <span className={`status-dot status-${report.status}`} aria-hidden="true" />
                  {report.status === 'completed' ? 'completed' : 'completed with diagnostics'}
                </dd>
              </div>
            )}
            {ready.loaded.kind === 'findings' && (
              <div>
                <dt>Document</dt>
                <dd>
                  {ready.loaded.format === 'sarif'
                    ? 'SARIF log, findings only'
                    : 'check report, findings only'}
                </dd>
              </div>
            )}
            {tool && (
              <div>
                <dt>Analyzer</dt>
                <dd>
                  {tool.name} {tool.version}
                </dd>
              </div>
            )}
            {source?.kind === 'server' && source.meta.analyzedAt && (
              <div>
                <dt>Analyzed</dt>
                <dd>
                  <time dateTime={source.meta.analyzedAt}>
                    {formatTime(source.meta.analyzedAt)}
                  </time>
                </dd>
              </div>
            )}
            {source?.kind === 'file' && (
              <div>
                <dt>File</dt>
                <dd>{source.name}</dd>
              </div>
            )}
            {git && (git.branch ?? git.commit) && (
              <div>
                <dt>Git</dt>
                <dd className="mono">
                  {git.branch ?? 'detached HEAD'}
                  {git.commit && ` · ${git.commit.slice(0, 7)}`}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className="topbar-actions">
        {source?.kind === 'server' && source.live && (
          <button
            type="button"
            className="button primary"
            onClick={onAnalyze}
            disabled={busy}
            aria-busy={busy}
          >
            <Icon name="refresh" />
            {busy ? 'Analyzing…' : 'Re-analyze'}
          </button>
        )}
        <a className="button" href={href('reports')}>
          <Icon name="upload" />
          Import report
        </a>
      </div>
    </header>
  );
}

function ThemeSwitch({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}) {
  const options: { value: ThemeChoice; label: string; icon: IconName }[] = [
    { value: 'system', label: 'System', icon: 'monitor' },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ];
  return (
    <fieldset className="theme-switch">
      <legend>Theme</legend>
      {options.map((option) => (
        <label key={option.value} title={option.label}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={choice === option.value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          <Icon name={option.icon} />
          <span className="visually-hidden">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function LoadingPage() {
  return (
    <div className="page" aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading the analysis…
      </p>
      <div className="ledger skeleton-ledger">
        <Skeleton lines={4} />
        <Skeleton lines={4} />
      </div>
      <Skeleton lines={6} />
    </div>
  );
}

function ErrorPage({
  state,
  onRetry,
}: {
  state: { message: string; problems: string[]; noServer: boolean };
  onRetry: () => void;
}) {
  return (
    <div className="page">
      <h1>{state.noServer ? 'No analysis to show' : 'The analysis could not be loaded'}</h1>
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
      <p className="lede">
        {state.noServer
          ? 'Start the dashboard with "deptrace dashboard" in your repository, or import a report file.'
          : 'Run "deptrace dashboard" again, or import a report file.'}
      </p>
      <div className="button-row">
        <button type="button" className="button primary" onClick={onRetry}>
          <Icon name="refresh" />
          Try again
        </button>
        <a className="button" href={href('reports')}>
          <Icon name="upload" />
          Import a report
        </a>
      </div>
    </div>
  );
}
