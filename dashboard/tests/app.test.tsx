import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { CanvasProps } from '../src/views/GraphCanvas';
import { defined, fixture, fixtureText, syntheticReport } from './helpers';

// Canvas rendering is tested in a real browser (dashboard/e2e). Here a DOM
// stand-in shows exactly what the graph view hands to the canvas.
vi.mock('../src/views/GraphCanvas', () => ({
  GraphCanvas: (props: CanvasProps) => (
    <ul aria-label="graph canvas" data-layout={props.layout}>
      {props.nodes
        .filter((node) => node.kind !== 'band')
        .map((node) => (
          <li
            key={node.id}
            data-state={
              props.highlight ? (props.highlight.nodes.has(node.id) ? 'lit' : 'dim') : 'plain'
            }
          >
            <button
              type="button"
              onClick={() => {
                props.onSelect({ kind: 'node', id: node.id });
              }}
            >
              {node.id}
            </button>
          </li>
        ))}
    </ul>
  ),
}));

const meta = {
  source: 'analysis',
  name: 'storefront',
  analyzedAt: '2026-10-27T08:00:00.000Z',
  git: { branch: 'main', commit: 'a'.repeat(40) },
};

function serve(report: unknown, options: { live?: boolean; status?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    if (options.status !== undefined) {
      return Promise.resolve(
        new Response('Forbidden: unexpected Host header.', { status: options.status }),
      );
    }
    const analyzedAt = url === '/api/analyze' ? '2026-10-27T09:30:00.000Z' : meta.analyzedAt;
    return Promise.resolve(
      new Response(
        JSON.stringify({ meta: { ...meta, analyzedAt }, live: options.live ?? true, report }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

async function open(hash: string, report: unknown = fixture('storefront-report.json')) {
  serve(report);
  window.location.hash = hash;
  render(<App />);
  await screen.findByText('storefront', { selector: '.project-name' });
}

/** Navigates like a link click; jsdom fires hashchange asynchronously. */
async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loading and errors', () => {
  it('shows a loading state, then the overview with real counts', async () => {
    serve(fixture('storefront-report.json'));
    render(<App />);
    expect(screen.getByText('Loading the analysis…')).toBeTruthy();
    const ledger = await screen
      .findByRole('group', { name: 'Analysis summary' })
      .catch(() => screen.findByLabelText('Analysis summary'));
    const row = (label: string) =>
      defined(within(ledger).getByText(label).closest<HTMLElement>('.ledger-row'));
    expect(within(row('Source files')).getByText('23')).toBeTruthy();
    expect(within(row('Internal dependencies')).getByText('35')).toBeTruthy();
    expect(within(row('Cycle groups')).getByText('2')).toBeTruthy();
    expect(within(row('Violations')).getByText('5')).toBeTruthy();
    expect(within(row('Unresolved imports')).getByText('2')).toBeTruthy();
    expect(within(row('Unclassified files')).getByText('2')).toBeTruthy();
    // Header facts come from the server and the report only.
    expect(screen.getByText('main · aaaaaaa')).toBeTruthy();
    expect(screen.getByText('deptrace 0.5.0')).toBeTruthy();
  });

  it('distinguishes missing data from zero', async () => {
    const report = fixture<Record<string, unknown> & { architecture: Record<string, unknown> }>(
      'storefront-report.json',
    );
    report.architecture = {
      ...report.architecture,
      layers: [],
      unlayeredFiles: (report.nodes as { id: string }[]).map((n) => n.id),
    };
    await open('#/overview', report);
    const row = defined(screen.getByText('Unclassified files').closest<HTMLElement>('.ledger-row'));
    expect(within(row).getByText('—')).toBeTruthy();
    expect(within(row).getByText('No layers configured in deptrace.yml')).toBeTruthy();
  });

  it('explains when no server answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'No analysis to show' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Import a report/ })).toBeTruthy();
  });

  it('shows server errors and invalid reports with their problems', async () => {
    serve(null, { status: 403 });
    const { unmount } = render(<App />);
    expect(await screen.findByText('Forbidden: unexpected Host header.')).toBeTruthy();
    unmount();

    serve({
      ...fixture('storefront-report.json'),
      edges: [{ from: 'a', to: 'b', typeOnly: false, references: [] }],
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'The analysis could not be loaded' }),
    ).toBeTruthy();
    expect(screen.getByText(/edges\[0\]\.from: refers to "a", which is not a node/)).toBeTruthy();
  });

  it('re-analyzes through the server and reports the result', async () => {
    const calls = serve(fixture('storefront-report.json'));
    render(<App />);
    const button = await screen.findByRole('button', { name: /Re-analyze/ });
    await userEvent.click(button);
    expect(await screen.findByText('Analysis updated.')).toBeTruthy();
    const post = defined(calls.find((call) => call.url === '/api/analyze'));
    expect(post.init?.method).toBe('POST');
    expect(new Headers(post.init?.headers).get('X-DepTrace-Request')).toBe('analyze');
  });

  it('hides re-analyze when the server shows a report file', async () => {
    serve(fixture('storefront-report.json'), { live: false });
    render(<App />);
    await screen.findByText('storefront', { selector: '.project-name' });
    expect(screen.queryByRole('button', { name: /Re-analyze/ })).toBeNull();
  });
});

describe('overview', () => {
  it('orders what to investigate, starting with the new violation', async () => {
    await open('#/overview');
    const leads = within(screen.getByRole('region', { name: 'Where to start' })).getAllByRole(
      'link',
    );
    expect(leads[0]?.textContent).toBe('1 new violation not accepted by the baseline');
    expect(leads[0]?.getAttribute('href')).toBe('#/violations?baseline=new');
    expect(leads.some((link) => /Runtime cycle of 3 files/.test(link.textContent))).toBe(true);
  });

  it('never calls a report without findings healthy', async () => {
    const report = fixture<
      Record<string, unknown> & {
        architecture: Record<string, unknown>;
        summary: Record<string, unknown>;
      }
    >('storefront-report.json');
    report.cycles = [];
    report.unresolvedDependencies = [];
    report.summary = {
      ...report.summary,
      unresolvedReferences: 0,
      cyclicComponents: 0,
      runtimeCycles: 0,
    };
    const architecture: Record<string, unknown> = {
      ...report.architecture,
      violations: [],
      errors: 0,
      warnings: 0,
    };
    delete architecture.baseline;
    report.architecture = architecture;
    await open('#/overview', report);
    expect(screen.getByText('Nothing in this report needs attention')).toBeTruthy();
    expect(screen.getByText(/it is not a verdict on the architecture/)).toBeTruthy();
  });
});

describe('violations', () => {
  it('filters, counts and opens a finding with its evidence', async () => {
    await open('#/violations');
    expect(screen.getByText('5 violations')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Severity'), 'warning');
    expect(screen.getByText('1 violation of 5')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Severity'), '');
    await userEvent.selectOptions(screen.getByLabelText('Baseline'), 'new');
    const items = screen.getAllByRole('link', { name: /layer-boundaries/ });
    expect(items).toHaveLength(1);
    await go(defined(items[0]?.getAttribute('href')));
    const card = await screen.findByRole('article', { name: 'Violation of layer-boundaries' });
    expect(within(card).getByText('src/ui/product-list.ts:3:30')).toBeTruthy();
    expect(within(card).getByText(/Not in the baseline/)).toBeTruthy();
    expect(within(card).getByText('../infrastructure/db/client')).toBeTruthy();
    expect(
      within(card)
        .getByRole('link', { name: /Show in graph/ })
        .getAttribute('href'),
    ).toMatch(/^#\/graph\?finding=/);
  });

  it('lists resolved baseline entries separately', async () => {
    await open('#/violations');
    const resolved = screen.getByRole('region', { name: 'Resolved baseline entries' });
    expect(within(resolved).getByText('5f0c2a9e41d7b386')).toBeTruthy();
  });

  it('searches by fingerprint and resets filters', async () => {
    await open('#/violations');
    const fingerprint = defined(
      (fixture('storefront-report.json').architecture as { violations: { fingerprint: string }[] })
        .violations[0],
    ).fingerprint;
    await userEvent.type(screen.getByLabelText('Search'), fingerprint);
    expect(screen.getByText('1 violation of 5')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Reset filters/ }));
    expect(screen.getByText('5 violations')).toBeTruthy();
  });
});

describe('modules', () => {
  it('searches, sorts and pulls a module card with direct and transitive relations', async () => {
    await open('#/modules');
    await userEvent.type(screen.getByLabelText('Search paths'), 'pricing');
    expect(screen.getByText('1 file of 23')).toBeTruthy();
    await go('#/modules?file=src/domain/pricing.ts');
    const card = await screen.findByRole('article', { name: 'Module src/domain/pricing.ts' });
    const imports = defined(within(card).getByText('Imports').closest('section'));
    expect(
      within(imports).getByRole('link', { name: 'src/infrastructure/db/client.ts' }),
    ).toBeTruthy();
    expect(within(card).getByText(/Transitive dependencies: 2 files/)).toBeTruthy();
    expect(within(card).getByText('fs')).toBeTruthy();
    expect(within(card).getByText(/Static imports only/)).toBeTruthy();
  });

  it('shows files with unresolved imports', async () => {
    await open('#/modules?show=unresolved');
    expect(screen.getByText('2 files of 23')).toBeTruthy();
  });

  it('sorts by a column and marks it for assistive technology', async () => {
    await open('#/modules');
    await userEvent.click(screen.getByRole('button', { name: /Imported by/ }));
    const header = defined(screen.getByRole('button', { name: /Imported by/ }).closest('th'));
    expect(header.getAttribute('aria-sort')).toBe('descending');
    const firstRow = defined(screen.getAllByRole('row')[1]);
    expect(within(firstRow).getAllByRole('link')[0]?.textContent).toBe('src/domain/product.ts');
  });
});

describe('cycles', () => {
  it('selects a cycle and explains it', async () => {
    await open('#/cycles?cycle=0');
    const card = await screen.findByRole('article', { name: 'Cycle 1' });
    expect(within(card).getByText('runtime')).toBeTruthy();
    expect(
      within(card).getAllByRole('link', { name: 'src/application/cart-service.ts' }).length,
    ).toBeGreaterThan(0);
    expect(within(card).getByText(/Tarjan/)).toBeTruthy();
    expect(within(card).getByText(/A group can contain other cycles/)).toBeTruthy();
    expect(
      within(card)
        .getByRole('link', { name: /Show in graph/ })
        .getAttribute('href'),
    ).toBe('#/graph?cycle=0');
  });

  it('has an empty state', async () => {
    await open('#/cycles', { ...fixture('storefront-report.json'), cycles: [] });
    expect(screen.getByText('No circular dependencies')).toBeTruthy();
  });
});

describe('layers', () => {
  it('builds the matrix from configured layers and the layer policy', async () => {
    await open('#/layers');
    const forbidden = screen.getByRole('link', {
      name: /^ui imports infrastructure: 1 dependency, forbidden by layer-boundaries, 1 violation/,
    });
    expect(forbidden).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /^ui imports application: 2 dependencies, allowed/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /^unclassified imports ui: 1 dependency, not governed/ }),
    ).toBeTruthy();
    await go(defined(forbidden.getAttribute('href')));
    const card = await screen.findByRole('article', { name: 'ui imports infrastructure' });
    expect(within(card).getByRole('link', { name: 'src/ui/product-list.ts' })).toBeTruthy();
  });

  it('opens a layer with its files and allowed targets', async () => {
    await open('#/layers?layer=domain');
    const card = await screen.findByRole('article', { name: 'Layer domain' });
    const mayImport = defined(within(card).getByText('May import').closest('section'));
    expect(within(mayImport).getByText('shared')).toBeTruthy();
    expect(within(card).getByText('7 files')).toBeTruthy();
  });

  it('explains how to configure layers when there are none', async () => {
    const report = fixture<Record<string, unknown> & { architecture: Record<string, unknown> }>(
      'storefront-report.json',
    );
    report.architecture = {
      ...report.architecture,
      layers: [],
      unlayeredFiles: (report.nodes as { id: string }[]).map((n) => n.id),
    };
    await open('#/layers', report);
    expect(screen.getByText('No layers configured')).toBeTruthy();
    expect(screen.getByText(/DepTrace does not infer layers/)).toBeTruthy();
  });
});

describe('dependency graph', () => {
  const canvasNodes = () =>
    within(screen.getByRole('list', { name: 'graph canvas' })).getAllByRole('listitem');

  it('renders the real graph and focuses a module from search', async () => {
    await open('#/graph');
    expect(canvasNodes()).toHaveLength(23);
    expect(screen.getByText(/Showing 23 nodes and 35 dependencies/)).toBeTruthy();
    const search = screen.getByRole('combobox', { name: 'Find a file in the graph' });
    await userEvent.type(search, 'cart-serv');
    await userEvent.keyboard('{Enter}');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(window.location.hash).toBe('#/graph?focus=src%2Fapplication%2Fcart-service.ts');
    const lit = canvasNodes().filter((node) => node.dataset.state === 'lit');
    expect(lit.map((node) => node.textContent).sort()).toEqual([
      'src/application/cart-service.ts',
      'src/application/checkout.ts',
      'src/application/payment.ts',
      'src/domain/cart.ts',
      'src/infrastructure/http/server.ts',
      'src/ui/cart-view.ts',
    ]);
    expect(
      await screen.findByRole('article', { name: 'Module src/application/cart-service.ts' }),
    ).toBeTruthy();
  });

  it('selects a node, highlights dependents to a depth and isolates them', async () => {
    await open('#/graph');
    await userEvent.click(screen.getByRole('button', { name: 'src/shared/money.ts' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await go('#/graph?focus=src/shared/money.ts&mode=dependents&depth=1');
    const lit = canvasNodes().filter((node) => node.dataset.state === 'lit');
    expect(lit).toHaveLength(5); // money.ts and its 4 direct importers
    await userEvent.click(screen.getByLabelText('Isolate: hide everything else'));
    expect(canvasNodes()).toHaveLength(5);
    expect(screen.getByText(/· isolated/)).toBeTruthy();
  });

  it('highlights a path and reports when none exists', async () => {
    await open('#/graph?focus=src/ui/cart-view.ts&to=src/domain/order.ts');
    expect(canvasNodes().filter((node) => node.dataset.state === 'lit')).toHaveLength(4);
    await go('#/graph?focus=src/shared/money.ts&to=src/main.ts');
    expect(screen.getByText(/No import path leads from/)).toBeTruthy();
  });

  it('highlights a cycle and a violation from links', async () => {
    await open('#/graph?cycle=0');
    expect(canvasNodes().filter((node) => node.dataset.state === 'lit')).toHaveLength(3);
    const finding = defined(
      (
        fixture('storefront-report.json').architecture as {
          violations: { file: string; fingerprint: string }[];
        }
      ).violations.find((v) => v.file === 'src/ui/product-list.ts'),
    );
    await go(`#/graph?finding=${finding.fingerprint}`);
    expect(
      canvasNodes()
        .filter((node) => node.dataset.state === 'lit')
        .map((n) => n.textContent)
        .sort(),
    ).toEqual(['src/infrastructure/db/client.ts', 'src/ui/product-list.ts']);
  });

  it('filters by layer and by violations, hides and shows packages, and resets', async () => {
    await open('#/graph');
    await userEvent.click(screen.getByText('Filters'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'domain' }));
    expect(canvasNodes()).toHaveLength(16);
    await userEvent.click(screen.getByRole('checkbox', { name: 'External packages' }));
    expect(screen.getByRole('button', { name: 'package:pg' })).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Only files in violations' }));
    expect(canvasNodes().length).toBeLessThan(16);
    const panel = defined(screen.getByText('Filters').closest('details'));
    await userEvent.click(within(panel).getByRole('button', { name: /Reset filters/ }));
    expect(canvasNodes()).toHaveLength(23);
  });

  it('groups by folder', async () => {
    await open('#/graph');
    await userEvent.click(screen.getByRole('button', { name: 'Folders' }));
    expect(screen.getByRole('button', { name: 'folder:src/domain' })).toBeTruthy();
    expect(screen.getByText(/Showing 7 folders/)).toBeTruthy();
  });

  it('refuses to draw a huge graph silently and offers smaller views', async () => {
    await open('#/graph', syntheticReport(3000, 40));
    // Large reports start grouped by folder.
    expect(screen.getByText(/Showing 40 folders/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Files' }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('This view is too large to draw at once')).toBeTruthy();
    expect(within(alert).getByText(/3,000 nodes/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'graph canvas' })).toBeNull();
    await userEvent.click(within(alert).getByRole('button', { name: 'Group by folder' }));
    expect(screen.getByRole('list', { name: 'graph canvas' })).toBeTruthy();
  });

  it('supports keyboard shortcuts: / to search and Escape to clear', async () => {
    await open('#/graph?focus=src/shared/money.ts');
    const page = defined(document.querySelector('.graph-page'));
    page.querySelector('button')?.focus();
    await userEvent.keyboard('/');
    expect(document.activeElement).toBe(
      screen.getByRole('combobox', { name: 'Find a file in the graph' }),
    );
    await userEvent.keyboard('{Escape}');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(window.location.hash).toBe('#/graph');
  });
});

describe('reports and import', () => {
  it('rejects an invalid file and keeps the current report', async () => {
    await open('#/reports');
    const input = screen.getByLabelText('Report file');
    await userEvent.upload(
      input,
      new File(['{"schemaVersion": 9, "nodes": []}'], 'bad.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(/bad\.json/)).toBeTruthy();
    expect(screen.getByText(/this dashboard reads version 1/)).toBeTruthy();
    expect(screen.getByText('The previous document is still shown.')).toBeTruthy();
  });

  it('imports SARIF as findings only and says what is unavailable', async () => {
    await open('#/reports');
    await userEvent.upload(
      screen.getByLabelText('Report file'),
      new File([fixtureText('storefront.sarif')], 'deptrace.sarif'),
    );
    expect(await screen.findByText('Loaded deptrace.sarif.')).toBeTruthy();
    await go('#/graph');
    expect(screen.getByText(/only contains findings/)).toBeTruthy();
    await go('#/violations');
    expect(screen.getByText('5 violations')).toBeTruthy();
  });

  it('imports a check report', async () => {
    await open('#/reports');
    await userEvent.upload(
      screen.getByLabelText('Report file'),
      new File([fixtureText('storefront-check.json')], 'check.json'),
    );
    expect(await screen.findByText('Loaded check.json.')).toBeTruthy();
    await go('#/overview');
    expect(screen.getByText(/check report, findings only/)).toBeTruthy();
  });
});

describe('privacy and security page', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('states the data practices and deletes the stored preference', async () => {
    localStorage.setItem('deptrace.theme', 'dark');
    await open('#/privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy & security' })).toBeTruthy();
    const storage = screen.getByRole('region', { name: 'What is stored' });
    expect(within(storage).getByText('deptrace.theme')).toBeTruthy();
    expect(within(storage).getByText('dark')).toBeTruthy();
    expect(
      screen.getByText(/No analytics, telemetry, fonts or other third-party requests/),
    ).toBeTruthy();
    expect(screen.getByText(/This analysis of storefront was made by/)).toBeTruthy();

    await userEvent.click(
      within(storage).getByRole('button', { name: /Delete stored preference/ }),
    );
    expect(localStorage.getItem('deptrace.theme')).toBeNull();
    expect(within(storage).getByText('nothing stored')).toBeTruthy();
    expect(within(storage).getByRole('status').textContent).toMatch(
      /stored preference was deleted/,
    );
    expect(
      within(storage).getByRole('button', { name: /Delete stored preference/ }),
    ).toHaveProperty('disabled', true);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('is reachable from the navigation and without a loaded analysis', async () => {
    await open('#/overview');
    expect(screen.getByRole('link', { name: 'Privacy & security' }).getAttribute('href')).toBe(
      '#/privacy',
    );
    cleanup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    window.location.hash = '#/privacy';
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy & security' }),
    ).toBeTruthy();
    expect(screen.getByText(/Report security problems privately/)).toBeTruthy();
  });

  it('shows hidden bidirectional characters in repository text instead of obeying them', async () => {
    const report = fixture<
      Record<string, unknown> & { architecture: { violations: { message: string }[] } }
    >('storefront-report.json');
    const rlo = String.fromCharCode(0x202e);
    const first = defined(report.architecture.violations[0]);
    first.message = `Evil ${rlo}gpj.exe message`;
    await open('#/violations', report);
    expect(screen.getByText('Evil \\u202egpj.exe message')).toBeTruthy();
    expect(document.body.textContent).not.toContain(rlo);
  });
});

describe('accessibility basics', () => {
  it('marks the current section and offers a skip link', async () => {
    await open('#/cycles');
    expect(screen.getByRole('link', { name: 'Cycles' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#main',
    );
  });

  it('switches the theme with labelled radio buttons', async () => {
    await open('#/overview');
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('toggles the navigation drawer button state', async () => {
    await open('#/overview');
    const menu = screen.getByRole('button', { name: 'Sections' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
  });
});
