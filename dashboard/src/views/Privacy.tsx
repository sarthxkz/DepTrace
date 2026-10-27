import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import type { Ready } from '../lib/state';
import { THEME_STORAGE_KEY, type ThemeChoice } from '../lib/theme';

function storedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * What this dashboard does with data, stated from how it actually works, and
 * the one privacy control it needs: deleting the stored preference.
 */
export function Privacy({
  ready,
  onTheme,
}: {
  ready: Ready | null;
  onTheme: (choice: ThemeChoice) => void;
}) {
  // Read on every render; re-render when the theme (and so the stored value) changes.
  const [, setVersion] = useState(0);
  useEffect(() => {
    const update = () => {
      setVersion((version) => version + 1);
    };
    window.addEventListener('deptrace-theme', update);
    return () => {
      window.removeEventListener('deptrace-theme', update);
    };
  }, []);
  const stored = storedTheme();
  const [status, setStatus] = useState('');
  const source = ready?.source;

  const forget = () => {
    onTheme('system');
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Storage unavailable: nothing was stored.
    }
    setStatus('The stored preference was deleted. The theme now follows your system.');
  };

  return (
    <div className="page privacy">
      <h1>Privacy &amp; security</h1>
      <p className="lede">
        How this dashboard handles your code and reports. It describes what the software does, not a
        legal policy; the project&rsquo;s policies are listed at the end.
      </p>

      <section className="panel" aria-labelledby="flow-title">
        <h2 id="flow-title">Where data goes</h2>
        <dl className="facts">
          <dt>Analysis</dt>
          <dd>
            DepTrace reads your source files on this computer and never runs them.{' '}
            {source?.kind === 'server' && source.meta.source === 'analysis'
              ? `This analysis of ${source.meta.name || 'your repository'} was made by "deptrace dashboard".`
              : source?.kind === 'file'
                ? `The document shown is the file ${source.name}, read in this browser tab.`
                : ''}
          </dd>
          <dt>Served from</dt>
          <dd>
            <code>{window.location.host}</code>: a server on this computer, reachable only from it
            (127.0.0.1). It stops when you stop <code>deptrace dashboard</code>.
          </dd>
          <dt>Network</dt>
          <dd>
            The page loads code and data only from that local server; its Content Security Policy
            blocks everything else. No analytics, telemetry, fonts or other third-party requests.
          </dd>
          <dt>Imported files</dt>
          <dd>
            Read and validated in this tab only, never uploaded, and gone when you reload or close
            it.
          </dd>
          <dt>Re-analysis</dt>
          <dd>Only when you press Re-analyze; nothing is analyzed in the background.</dd>
        </dl>
      </section>

      <section className="panel" aria-labelledby="storage-title">
        <h2 id="storage-title">What is stored</h2>
        <dl className="facts">
          <dt>In this browser</dt>
          <dd>
            One preference, only if you choose Light or Dark: the theme, under{' '}
            <code>{THEME_STORAGE_KEY}</code>. Currently:{' '}
            <strong>{stored === null ? 'nothing stored' : stored}</strong>.
          </dd>
          <dt>On the local server</dt>
          <dd>
            The latest analysis, in memory only, until the server stops. The dashboard writes no
            files.
          </dd>
          <dt>Report files</dt>
          <dd>
            Only where you write them (for example <code>--report</code>, <code>--sarif</code> or a
            CI artifact). They contain repository paths, import specifiers, rule messages and
            fingerprints from your code: handle them like source code. Absolute paths and your home
            directory are removed from them.
          </dd>
        </dl>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={forget}
            disabled={stored === null}
            aria-describedby="storage-title"
          >
            <Icon name="close" /> Delete stored preference
          </button>
        </div>
        <p role="status" className="muted">
          {status}
        </p>
      </section>

      <section className="panel" aria-labelledby="policies-title">
        <h2 id="policies-title">Policies and reporting a vulnerability</h2>
        <p>
          These files are in the DepTrace repository. Report security problems privately as
          described in <code>SECURITY.md</code>, not in a public issue.
        </p>
        <ul className="ref-list">
          <li>
            <code>SECURITY.md</code> how to report a vulnerability, and what is in scope
          </li>
          <li>
            <code>PRIVACY.md</code> privacy policy (draft, legal review pending)
          </li>
          <li>
            <code>TERMS.md</code> terms of use (draft; the project has no license yet)
          </li>
          <li>
            <code>docs/trust/</code> security features, data inventory and threat model
          </li>
        </ul>
      </section>
    </div>
  );
}
