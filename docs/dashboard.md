# Dashboard

`deptrace dashboard` shows DepTrace's analysis in your browser: the dependency graph, layers,
cycles, modules and rule violations, with the evidence behind every finding (the rule, the import
statement, its line and column, the dependency path, the fingerprint and the baseline status).

Everything shown comes from the analyzer's JSON report. Nothing is estimated, scored or inferred:
when the report does not contain something, the dashboard says so instead of showing a zero.

## Quick start

```sh
npm run build                                   # builds the CLI and dist/dashboard
node dist/index.js dashboard                    # analyze the current directory
node dist/index.js dashboard ./my-app --baseline deptrace-baseline.json
```

```console
$ deptrace dashboard tests/fixtures/storefront
deptrace dashboard: http://127.0.0.1:7341/
Serving the analysis on 127.0.0.1 only. Press Ctrl+C to stop.
```

Open the printed URL. **Re-analyze** in the header repeats the analysis of the same directory with
the same options (`deptrace.yml` and the baseline are read again). Stop the server with Ctrl+C.

| Option              | Meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `[directory]`       | Repository root to analyze (default: current directory)                                |
| `--baseline <file>` | Mark each violation as new or accepted (requires `deptrace.yml` with rules)            |
| `--report <file>`   | Show a saved `report --format json` file instead of analyzing (no re-analysis)         |
| `--port <port>`     | Port on 127.0.0.1 (default `7341`; `0` picks a free port). An occupied port is exit 1. |

Without a server you can still look at a report: start any `deptrace dashboard` (or
`--report <file>`) and use **Import report** to open other files. Imported files are read and
validated in the browser; they are never uploaded.

## Supported documents

| Document                           | Create it with                                         | The dashboard shows                                      |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| DepTrace report, `schemaVersion` 1 | `deptrace report --format json [--baseline <file>]`    | Everything                                               |
| DepTrace check report              | `deptrace check --format json` or `--report <file>`    | Violations and baseline status (findings only, no graph) |
| SARIF 2.1.0                        | `deptrace check --sarif <file>` (or another SARIF log) | Findings, locations, fingerprints, baseline state        |

With a findings-only document, the Graph, Layers, Cycles, Modules and Configuration pages say that
the document has no dependency graph; they never show placeholders.

## The data contract

The dashboard reads the `deptrace report --format json` document, which is the `scan --format json`
document (see [analysis.md](analysis.md)) plus an `architecture` section
(see [rules.md](rules.md#deptrace-report-directory)). Fields the dashboard uses:

| Field                                                     | Used for                                                 |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `schemaVersion`, `tool`, `status`, `repository`           | Header, compatibility check                              |
| `summary`                                                 | Overview counts                                          |
| `nodes`, `edges` (with every import reference)            | Graph, modules, layer matrix, paths                      |
| `cycles` (members, representative path, edges, runtime)   | Cycles page, cycle highlighting                          |
| `externalDependencies`, `unresolvedDependencies`          | Packages per file, unresolved imports                    |
| `settings`, `architecture.rules`                          | Configuration page                                       |
| `architecture.layers`, `unlayeredFiles`, `layerRule`      | Layer colours, layer matrix, allowed and forbidden pairs |
| `architecture.violations` (with `fingerprint`, `path`, …) | Violations, highlighting, module cards                   |
| `architecture.baseline`, `violations[].baselineStatus`    | New / accepted / resolved, only when the report has them |

`layerRule` (the configured `layer-boundaries` policy, or `null`) and the baseline fields were added
in DepTrace 0.5.0. They are additive, so `schemaVersion` stays `1`; a report from 0.4.0 still loads,
and the Layers page then says that allowed and forbidden pairs are unknown.

### Validation

Every document, including the one the local server sends, is validated before anything is drawn
(`dashboard/src/contract/`). A document is rejected, with up to 20 problems and their JSON
locations (for example `edges[3].to: refers to "src/x.ts", which is not a node`), when:

- it is not JSON, is larger than 64 MB, or is none of the formats above;
- `schemaVersion` is missing or not `1` (a newer version is named as such);
- a field the dashboard reads is missing or has the wrong type;
- node ids are duplicated, or an edge, cycle, layer, unresolved import or violation refers to a
  node that does not exist, or a cycle edge is not an edge of the graph;
- a file is in two layers, a fingerprint is duplicated, or baseline statuses appear without a
  baseline section (or the reverse).

A rejected import leaves the current document on screen. Unknown extra fields are ignored, so newer
additive fields do not break older dashboards.

## Pages

**Overview.** Counts from `summary`: source files, internal (file-to-file) dependencies, external
packages, cycle groups (runtime and type-only), violations, unresolved imports and unclassified
files. "—" means the report does not contain the measure (for example no layers configured), which
is different from `0`. Charts: violations by rule, files per layer, most imported files, files with
the most dependencies, and import statements by kind. **Where to start** lists what to investigate,
in order: new violations (with a baseline), error violations by rule, runtime cycles, warnings,
unresolved imports, parse problems, type-only cycles. There is no health score, and an empty list
says that it only covers the configured rules and static imports.

**Dependency graph.** The real file graph, drawn with Cytoscape.js.

- Pan, zoom (buttons, wheel, `+`/`-`), fit (`F`), reset view (clears the selection).
- Select a file in the canvas or with the search box (`/`, arrow keys, Enter); select an edge to
  see its import statements.
- Highlight: direct neighbours, dependencies (what it imports, transitively) or dependents (what
  imports it), to depth 1, 2, 3 or all; a shortest import path to another file; a cycle; a
  violation. Everything else is dimmed; **Isolate** hides it.
- Filters: folder prefix, path text, layers (including unclassified), files importing a package,
  import kinds, type-only imports, only files in violations, only files in cycles, external
  packages as nodes. **Reset filters** restores everything.
- Layouts: by layer (one labelled band per configured layer, unclassified last; by top folder
  without layers), hierarchy (breadth-first, edges point down), force (up to 600 nodes).
- **Files / Folders** groups files by folder (depth 1–4); folder edges are labelled with the number
  of file-to-file dependencies they stand for.

Encoding (also in the legend): fill colour is the configured layer (grey: unclassified); a red or
amber ring marks the source file of an error or warning violation; node size grows with the number
of direct imports plus importers (it does not measure complexity or importance). Arrows point from
the importing file to the imported file; dashed edges are type-only, red edges cause a violation,
magenta edges lie inside a cycle, dotted edges go to external packages.

**Modules.** Every analyzed file with its layer, direct imports and importers, packages and
violations; search, layer filter, preset filters (violations, cycles, unresolved imports, parse
problems, no relations), sortable columns and pages of 100. Selecting a file opens its card: direct
imports and importers with line:column of every import, transitive dependencies and dependents
(with distance, by depth), external packages, unresolved imports, violations, cycle membership,
"Show in graph" and "Copy path". Direct and transitive relations are kept apart; the card states
that only static imports are known.

**Cycles.** The strongly connected components DepTrace found. Selecting one shows its
representative path (one shortest cycle through its first file; a component can contain more
cycles), all its files and internal dependencies with import locations, the violation that reports
it (if a rule does), and how it was detected. "Show in graph" highlights it.

**Layers.** A matrix of dependencies between the configured layers (rows import columns), using
the report's layer membership and `layerRule`: allowed, forbidden (with the number of violations
reported), within a layer, or involving unclassified files (not governed). Selecting a cell lists
its dependencies and boundary violations; selecting a layer shows its patterns, files, allowed
targets, dependencies to and from other layers and its violations. Layers are never inferred: with
none configured, the page explains how to configure them.

**Violations.** Search (rule, message, file, fingerprint), severity, rule, baseline status (only
when the report has a baseline) and module filters, sorting, pages of 50. A violation's card shows
the rule and its description, the message, source, target, location, the imports that cause it,
the dependency path, the fingerprint and what its baseline status means. Resolved baseline entries
are listed separately. These are architecture rule violations, not security vulnerabilities, and the
page says so. Line numbers come from the report; nothing else (such as code snippets) is
shown.

**Reports.** What is loaded (source, format, schema version, producer, analysis time), file import
with validation errors, and the supported formats. **There is no history**: DepTrace does not store
snapshots, so the dashboard shows one report at a time and no trends.

**Configuration.** The analysis settings and rules recorded in the report (read-only).

**Privacy & security.** What the dashboard does with data (local analysis, local server, no
third-party requests, imported files stay in the tab), what it stores (only the theme preference,
under `deptrace.theme`, and only if you choose Light or Dark) with a button to delete it, and where
to report vulnerabilities. It is available even when no analysis could be loaded. See the
[Security & Trust Center](trust/README.md).

The header shows the project (package name, else the directory or file name), analysis status,
analyzer version, analysis time and Git branch and commit. The analysis time and Git information
come only from a live analysis; Git information is read from `.git` files (HEAD and refs) without
running `git`, and is left out when it cannot be read reliably.

## Large repositories

- The graph view draws at most **1,500 nodes and 6,000 edges** at once. A larger view is not drawn
  and not truncated: the page says how large it is and offers grouping by folder, search, or
  drawing everything anyway.
- Reports with more than 1,500 files open the graph grouped by folder.
- The force layout is offered up to 600 nodes; the by-layer layout is linear and the default.
- Above 400 nodes or 1,500 edges the canvas switches to straight edges, hides edges while panning
  and hides labels until you zoom in.
- Highlighting changes only styles; filtering and layout changes rebuild the drawn elements.
- Lists (modules, violations) are paginated. Indexing, filtering and folder grouping of 20,000
  files is covered by a test.

## How it works and what it trusts

```
deptrace dashboard ──analysis (static, in-process)──▶ report JSON (in memory)
        │
        └─ http://127.0.0.1:<port>
             GET  /              built app (dist/dashboard, loaded into memory at startup)
             GET  /api/report    { meta, live, report }
             POST /api/analyze   re-run the same analysis (live mode only)
```

- The analysis is the same static analysis as `deptrace report`: repository code is never run.
- The server binds to **127.0.0.1 only**. It answers only requests whose `Host` is
  `127.0.0.1:<port>` or `localhost:<port>` (blocks DNS rebinding).
- No URL maps to the filesystem: the built app's files are read once at startup and served from
  memory; any other path is 404. The API takes no paths or parameters, so a browser cannot choose
  what is analyzed or read.
- `POST /api/analyze` requires the server's own `Origin` and an `X-DepTrace-Request` header (which
  forces a CORS preflight the server never approves), accepts no request body (413), and runs one
  analysis at a time (409).
- Responses carry a strict Content Security Policy (`default-src 'none'`, scripts and styles from
  the same origin only, no framing), `nosniff`, `no-referrer` and `no-store`.
- The app renders all repository text (paths, messages, specifiers) as text; there is no HTML
  rendering of report content. Invisible control and bidirectional-override characters in that text
  are shown as visible escapes (for example, U+202E RIGHT-TO-LEFT OVERRIDE appears as a backslash-u escape), so a file name cannot display as something
  else. It makes no external requests: no fonts, analytics or telemetry.
- Reports contain repository-relative paths only; the server adds the directory name, never its
  absolute path.
- There is no authentication: any program running as you on this machine can read the report from
  the local port while the server runs. Stop the server when you are done.

## Development

```sh
npm run build                   # CLI (tsup) + dashboard (Vite) into dist/
node dist/index.js dashboard tests/fixtures/storefront --baseline tests/fixtures/storefront/deptrace-baseline.json

npm run dashboard:dev           # Vite dev server with hot reload on http://127.0.0.1:5173,
                                # forwarding /api to a running "deptrace dashboard" (DEPTRACE_API)
npm test                        # unit, component (jsdom) and integration tests
npm run test:e2e                # Playwright against the built CLI in the installed Chrome
```

The app lives in `dashboard/` (React, Cytoscape.js, plain CSS with design tokens) and never imports
analyzer code; the `dashboard-app` layer in DepTrace's own `deptrace.yml` enforces that. React and
Cytoscape are bundled into `dist/dashboard`, so the CLI gains no runtime dependency.

Tests:

- `dashboard/tests/contract.test.ts`: valid, invalid, oversized and malformed documents.
- `dashboard/tests/model.test.ts`: graph indexing, traversal, paths, filters, folders, layout, and
  a 20,000-file graph.
- `dashboard/tests/app.test.tsx`: every page with the real fixture report, including loading,
  empty and error states, search, filters, highlighting, the large-graph limit, import and keyboard
  behavior (the canvas is replaced by a DOM stand-in).
- `tests/integration/dashboard-cli.test.ts`: the server (headers, path traversal attempts, foreign
  hosts and origins, re-analysis, report files, errors) and the contract against real CLI output.
- `dashboard/e2e/dashboard.spec.ts`: the real canvas in Chrome, including clicking a node, and a
  phone-sized viewport.

The fixtures in `dashboard/tests/fixtures/` are real analyzer output for `tests/fixtures/storefront`
(five layers, a runtime and a type-only cycle, forbidden imports and packages, external packages,
unresolved imports, clean files, and a baseline with one new and one resolved entry). A test fails
when they drift from the CLI. Regenerate them from a copy outside any Git repository (so paths do
not get a repository prefix), with `summary.durationMs` set to `0` in the report.

## Limitations

- Static imports only: runtime relationships are not known, and the dashboard says so.
- One report at a time; no stored history, trends or comparisons between reports.
- No live file watching: use **Re-analyze**. The server keeps the last analysis in memory.
- The canvas is not screen-reader accessible; every graph fact is also available as text on the
  Modules, Cycles, Layers and Violations pages, and the graph has keyboard search and shortcuts.
- Layer colours are never reused: past eight layers, further layers share one grey, as unclassified
  files do. Layer names are always shown in the legend, filters and lists.
- The dashboard has not been tested with screen readers or in Firefox and Safari; the end-to-end
  tests run in Chrome.
