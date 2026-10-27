# DepTrace

**See your architecture. Catch violations before they ship.**

DepTrace is a command-line tool for analyzing the architecture of TypeScript and JavaScript
repositories. It builds a static dependency graph of your source files, finds circular
dependencies, lets you inspect who depends on what, and checks the graph against architecture
rules you define (layers, forbidden imports and packages, module boundaries, cycle policies).

> **Status: Phase 7A (security, privacy and legal foundation).** Dependency analysis, dependency inspection, the
> rules engine (`check`), architecture reports (`report`), baselines, SARIF output, GitHub Actions
> workflows and a local browser dashboard (`dashboard`) work; security, privacy and legal documents
> exist as drafts awaiting legal review. The package is not published to npm
> and there is no published GitHub Action. See [Roadmap](#roadmap).

## What works today

| Command                        | Status  | What it does                                                                   |
| ------------------------------ | ------- | ------------------------------------------------------------------------------ |
| `deptrace scan [directory]`    | Working | Dependency analysis: files, imports, graph, cycles, diagnostics (text or JSON) |
| `deptrace deps <file>`         | Working | What a file imports (`outgoing`), or which files import it (`incoming`)        |
| `deptrace path <from> <to>`    | Working | A shortest import path between two files                                       |
| `deptrace init`                | Working | Creates a starter `deptrace.yml`; never overwrites an existing one             |
| `deptrace --help`, `--version` | Working |                                                                                |
| `deptrace check [directory]`   | Working | Evaluates the rules in `deptrace.yml`; exit code `3` on violations             |
| `deptrace report [directory]`  | Working | Layers, layer dependencies, rule results and cycles (text or JSON)             |
| `deptrace baseline create`     | Working | Records the current violations in `deptrace-baseline.json`; never overwrites   |
| `deptrace baseline update`     | Working | Replaces an existing baseline (explicit, atomic)                               |
| `deptrace check --baseline`    | Working | Fails only on violations not in the baseline; reports new/existing/resolved    |
| `deptrace dashboard`           | Working | Graph, layers, cycles, modules and violations in the browser (127.0.0.1 only)  |

The analysis is **static**: DepTrace parses files with the TypeScript compiler and never runs your
code. It cannot see imports computed at runtime, dependency injection, reflection or other
dynamic relationships, so the graph is not a complete runtime architecture map. A dependency, even
a circular one, is reported by `scan` as a finding, not as a policy violation: only `check`
enforces rules, and only the rules you configure.

Documentation:

- [docs/rules.md](docs/rules.md): rule catalog, `check` and `report`, violations, troubleshooting
- [docs/baseline.md](docs/baseline.md): baselines, fingerprints, compatibility, approval process
- [docs/github-actions.md](docs/github-actions.md): GitHub Actions setup, SARIF, security model
- [docs/dashboard.md](docs/dashboard.md): the dashboard, supported reports, graph limits, security
- [docs/trust/README.md](docs/trust/README.md): Security & Trust Center: security features, data
  inventory, threat model; [SECURITY.md](SECURITY.md) (reporting vulnerabilities),
  [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) (drafts, legal review required)
- [docs/configuration.md](docs/configuration.md): `deptrace.yml` reference
- [docs/analysis.md](docs/analysis.md): recognized imports, resolution, cycles, JSON schema,
  diagnostics, limitations
- [docs/performance.md](docs/performance.md): design and measured performance

## Installation

Requires **Node.js 22.12 or later**.

The package is not published to npm yet. The intended package name is **`deptrace-cli`**
(`deptrace` is already taken on npm; `deptrace-cli` was unclaimed when checked on 2026-10-26, but
availability is only certain at publish time). To try it locally:

```sh
git clone <this repository> deptrace
cd deptrace
npm ci
npm run build

node dist/index.js --help      # run the built file directly
npm link && deptrace --help    # or link the `deptrace` command globally
npm pack                       # or create deptrace-cli-<version>.tgz to install elsewhere
```

`npx deptrace` does **not** work from an unpublished checkout; use one of the options above.

## Usage

### `deptrace scan [directory]`

Analyzes the directory (default: current directory). Reads `deptrace.yml` from that directory if
present.

```console
$ deptrace scan
DepTrace dependency analysis

Repository
  Directory:                      /home/me/my-app
  package.json:                   my-app@1.0.0
  tsconfig files used:            tsconfig.json
  Git repository:                 yes (root: /home/me/my-app)
  Configuration:                  none (all supported files)

Files
  Source files discovered:        14
  Parsed without syntax errors:   13
  Parsed with syntax errors:      1
  ...

Dependency graph
  Nodes (files):                  14
  Edges (file -> file):           15 (4 type-only)
  Strongly connected components:  12 (3 cyclic)

Circular dependencies: 3 cyclic components (2 runtime, 1 type-only)
  1. (1 file) src/self.ts -> src/self.ts
  2. (2 files) src/services/api.ts -> src/utils/index.ts -> src/services/api.ts
  3. (2 files, type-only imports only) src/types-cycle/a.ts -> src/types-cycle/b.ts -> src/types-cycle/a.ts
  Each entry shows one representative cycle; a component can contain more.

Diagnostics: 1 error, 5 warnings, 1 info
  error   src/broken.ts:3:30  [parse-error] Syntax error: ')' expected. Imports were still extracted where possible.
  warning src/index.ts:9:21  [unresolved-import] Cannot resolve "./missing": no matching file exists.
  ...

Analysis completed with diagnostics in 0.06s. Some dependencies may be missing from the graph; see Diagnostics.
```

| Option          | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `--format json` | Print the full graph as JSON to stdout ([schema](docs/analysis.md#json-output)) |
| `--verbose`     | List every cycle edge with locations, all diagnostics and external packages     |

A cyclic component is a strongly connected component: a group of files that all (transitively)
import each other. Each one is listed with **one** representative cycle; the group may contain
more cycles. Cycles marked "type-only" exist only through `import type`-style imports and vanish
at runtime.

### `deptrace deps <file>`

```console
$ deptrace deps src/utils/index.ts --direction both
Dependencies of src/utils/index.ts

Outgoing (what src/utils/index.ts imports):
  Internal files (1):
    src/services/api.ts  "../services/api" import 1:21
  External packages (0)
  Resolved, but not analyzed (0)
  Unresolved (0)

Incoming (files that import src/utils/index.ts):
  Internal files (3):
    src/component.tsx  "./utils" import 1:24
    src/index.ts  "./utils" import 1:24
    src/services/api.ts  "../utils" import 1:24

Circular dependency: src/utils/index.ts is in a cyclic component of 2 file(s). Representative cycle: src/services/api.ts -> src/utils/index.ts -> src/services/api.ts
```

`--direction outgoing` (default) shows what the file imports, `incoming` which files import it,
`both` both. `--root <dir>` selects the repository root (default `.`); the file argument is
relative to the current directory. `--format json` is supported.

### `deptrace path <from> <to>`

```console
$ deptrace path src/component.tsx src/services/api.ts
Dependency path from src/component.tsx to src/services/api.ts (2 steps):
  src/component.tsx
    -> src/utils/index.ts  "./utils" import 1:24
    -> src/services/api.ts  "../services/api" import 1:21
```

Follows imports from importer to imported file. Prints `No dependency path from ... to ...` when
none exists (exit code `0`). Supports `--root` and `--format json`.

### `deptrace check [directory]`

Evaluates the architecture rules in `deptrace.yml` (see [docs/rules.md](docs/rules.md)):

```yaml
layers:
  - name: presentation
    files: ['src/presentation/**']
  - name: domain
    files: ['src/domain/**']
  - name: infrastructure
    files: ['src/infrastructure/**']

rules:
  layer-boundaries: # importer layer -> layers it may import
    allowed:
      presentation: [domain]
      domain: []
      infrastructure: [domain]
  forbidden-packages:
    - name: pure-domain
      from: ['src/domain/**']
      packages: ['express', 'pg']
  circular-dependencies:
    severity: warning
    ignore-type-only: true
```

```console
$ deptrace check
DepTrace architecture check

Rules
  error   layer-boundaries                         3 violations
  error   forbidden-packages/pure-domain           1 violation
  warning circular-dependencies                    1 violation

Violations: 4 errors, 1 warning
  warning src/application/notify.ts:1:28  [circular-dependencies]
          Circular dependency between 2 file(s): src/application/notify.ts -> src/application/place-order.ts -> src/application/notify.ts.
  error   src/domain/pricing.ts:1:30  [forbidden-packages/pure-domain]
          src/domain/pricing.ts must not import the package "express" (rule "forbidden-packages/pure-domain").
          imports: "express" import type-only 1:30
  error   src/domain/pricing.ts:2:22  [layer-boundaries]
          Layer "domain" must not depend on layer "infrastructure" (allowed for "domain": none). src/domain/pricing.ts imports src/infrastructure/db/connection.ts.
          imports: "../infrastructure/db/connection" import 2:22
  ...

Analysis: complete (20 files, 26 dependencies).
error: Architecture check failed: 4 failing violations.
```

(Output for the sample project in `tests/fixtures/layered` with the configuration above.)

Exit codes: `0` passed, `3` violations, `2` missing/invalid configuration or no rules. `--strict`
makes warnings fail too; `--format json` prints machine-readable results with a stable
`fingerprint` per violation. Unresolved imports and cycles are never violations unless a rule
says so.

A complete sample project with every rule type and seven deliberate violations is in
[tests/fixtures/layered](tests/fixtures/layered): `deptrace check tests/fixtures/layered`.

| Option              | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `--format`          | `text` (default), `json`, or `github` (text plus GitHub annotations)               |
| `--strict`          | Warning violations fail too                                                        |
| `--baseline <file>` | Fail only on violations not in the baseline ([docs/baseline.md](docs/baseline.md)) |
| `--report <file>`   | Also write the JSON report to a file                                               |
| `--sarif <file>`    | Also write a SARIF 2.1.0 log (for code scanning)                                   |
| `--summary <file>`  | Append a Markdown summary, e.g. to `"$GITHUB_STEP_SUMMARY"`                        |
| `--verbose`         | Show violation fingerprints                                                        |

### Baselines

To adopt DepTrace in a codebase that already has violations, accept them in a baseline and fail
only on new ones:

```sh
deptrace baseline create                        # writes deptrace-baseline.json; review and commit it
deptrace check --baseline deptrace-baseline.json
deptrace baseline update                        # after review: accept changes, drop resolved entries
```

Existing violations are still reported (marked `existing`), resolved ones are listed, and a
missing, invalid or incompatible baseline (for example after a rule changed) fails with exit code
`2` instead of being treated as empty. See [docs/baseline.md](docs/baseline.md).

### GitHub Actions

A copyable workflow is in
[docs/examples/github-actions/deptrace.yml](docs/examples/github-actions/deptrace.yml): full or
baseline-aware checks on pull requests and pushes, a job summary, annotations at the offending
imports, the JSON report as an artifact, read-only permissions. An optional second workflow
uploads SARIF to GitHub code scanning. Setup, permissions and the security model are in
[docs/github-actions.md](docs/github-actions.md). The workflows have not yet run on GitHub.

### `deptrace report [directory]`

An architecture overview: analysis summary, layers with file counts, dependencies between layers
(marked allowed / NOT ALLOWED), rule results, violations and cycles. Always exits `0` when the
analysis completes; `--format json` adds an `architecture` section to the `scan` JSON document.
`--baseline <file>` marks each violation as new or accepted and lists resolved baseline entries.

### `deptrace dashboard [directory]`

Analyzes the directory and serves an interactive dashboard on `http://127.0.0.1:7341/` (local only;
`--port 0` picks a free port): an overview of what was found and where to start, the dependency
graph (search, highlight dependencies, dependents, paths, cycles and violations, filters, folder
grouping), the layer matrix from your `deptrace.yml`, module cards with every import location,
cycles, and violations with fingerprints and baseline status. `--baseline <file>` adds new /
accepted / resolved; `--report <file>` shows a saved `report --format json` file instead. The
dashboard can also import check reports and SARIF logs (findings only). Nothing leaves your machine.

```sh
deptrace dashboard --baseline deptrace-baseline.json
deptrace report --format json > report.json && deptrace dashboard --report report.json
```

See [docs/dashboard.md](docs/dashboard.md) for every page, the data contract, large-graph behavior
and the security model.

### `deptrace init`

Creates a starter `deptrace.yml` in the current directory, with a commented rules example. If the
file exists, nothing is written and the command exits with code `1`. There is no overwrite flag.
The full format is described in [docs/configuration.md](docs/configuration.md); without a
`deptrace.yml`, `scan` analyzes all supported files and `check` refuses to run.

### Global options

| Option          | Description                                         |
| --------------- | --------------------------------------------------- |
| `-h, --help`    | Show help (also `deptrace <command> --help`)        |
| `-V, --version` | Print the version                                   |
| `--debug`       | Print stack traces and underlying errors on failure |

## Exit codes

| Code  | Meaning                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Success. For `scan`/`deps`/`path`: the analysis completed, even if it found cycles or diagnostics                                                                                                                       |
| `1`   | Operational error (e.g. permission denied, `deptrace.yml` or the baseline already exists for `init` / `baseline create`)                                                                                                |
| `2`   | Invalid usage or configuration (unknown command/option, missing directory, invalid `deptrace.yml`, `check` without rules, file argument that is not an analyzed source file, missing, invalid or incompatible baseline) |
| `3`   | `check`: architecture rule violations (errors; with `--strict` also warnings; with `--baseline` only new ones)                                                                                                          |
| `4`   | Reserved for functionality that is not implemented (no command returns it today)                                                                                                                                        |
| `130` | Interrupted with Ctrl+C                                                                                                                                                                                                 |

Whether an analysis was complete is reported in the output (`status` in JSON, the last line in
text), not in the exit code.

## Security, privacy and license

DepTrace runs only on your machine and in your CI: no telemetry, no network requests from the CLI,
no accounts. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a
public issue. What DepTrace reads and stores is listed in the
[data inventory](docs/trust/data-inventory.md); protections and their tests are in the
[Security & Trust Center](docs/trust/README.md).

The repository has **no license yet**, and the privacy policy and terms are drafts with
placeholders that need the owner's decisions and legal review.

## Development

```sh
npm ci                 # install from the lockfile
npm run dev -- scan .  # run from source with tsx
npm run build          # bundle to dist/ with tsup
npm start -- --help    # run the built CLI
npm test               # build, then run unit, component and integration tests (Vitest)
npm run test:e2e       # dashboard end-to-end tests in the installed Chrome (Playwright)
npm run dashboard:dev  # dashboard with hot reload (needs a running "deptrace dashboard")
npm run lint           # ESLint (typescript-eslint strict, type-checked)
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier
npm run bench          # reproducible performance benchmark
```

See [docs/development.md](docs/development.md) and [docs/architecture.md](docs/architecture.md).

## Roadmap

Planned, **not available** in this release:

- Publishing to npm and a reusable, versioned GitHub Action (today each repository copies the
  workflow and pins DepTrace by commit).
- Pull request comments.
- History across runs: stored snapshots and trends in the dashboard (today it shows one report).
