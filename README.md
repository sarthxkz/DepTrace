# DepTrace

**See your architecture. Catch violations before they ship.**

DepTrace is a command-line tool for analyzing the architecture of TypeScript and JavaScript
repositories. It builds a static dependency graph of your source files, finds circular
dependencies, and lets you inspect who depends on what.

> **Status: Phase 2 (dependency analysis).** Import extraction, module resolution, the dependency
> graph, cycle detection and dependency inspection work. **Architecture rules (`check`) and
> reports (`report`) are not implemented yet.** See [Roadmap](#roadmap).

## What works today

| Command                        | Status          | What it does                                                                   |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------ |
| `deptrace scan [directory]`    | Working         | Dependency analysis: files, imports, graph, cycles, diagnostics (text or JSON) |
| `deptrace deps <file>`         | Working         | What a file imports (`outgoing`), or which files import it (`incoming`)        |
| `deptrace path <from> <to>`    | Working         | A shortest import path between two files                                       |
| `deptrace init`                | Working         | Creates a starter `deptrace.yml`; never overwrites an existing one             |
| `deptrace --help`, `--version` | Working         |                                                                                |
| `deptrace check`               | Not implemented | Prints a notice and exits with code `4`. No checks are run                     |
| `deptrace report`              | Not implemented | Prints a notice and exits with code `4`. No report is generated                |

The analysis is **static**: DepTrace parses files with the TypeScript compiler and never runs your
code. It cannot see imports computed at runtime, dependency injection, reflection or other
dynamic relationships, so the graph is not a complete runtime architecture map. A dependency, even
a circular one, is reported as a finding, not as a policy violation: there are no rules yet, and
`scan` exits `0` whenever the analysis completes.

Full details: [docs/analysis.md](docs/analysis.md) (recognized imports, resolution, cycles, JSON
schema, diagnostics, limitations) and [docs/performance.md](docs/performance.md).

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

### `deptrace init`

Creates `deptrace.yml` in the current directory. If the file exists, nothing is written and the
command exits with code `1`. There is no overwrite flag.

### Global options

| Option          | Description                                         |
| --------------- | --------------------------------------------------- |
| `-h, --help`    | Show help (also `deptrace <command> --help`)        |
| `-V, --version` | Print the version                                   |
| `--debug`       | Print stack traces and underlying errors on failure |

## Configuration

`deptrace init` writes the following (the project name is taken from the directory name):

<!-- prettier-ignore -->
```yaml
version: 1

# DepTrace configuration (format version 1).
# Read by "deptrace scan", "deptrace deps" and "deptrace path".

project:
  name: "my-app"

# Which files the dependency analysis covers. Patterns are globs relative to
# this directory. Only .ts .tsx .js .jsx .mts .cts .mjs .cjs files are analyzed.
# node_modules, dist, build, coverage, .git, .next, .turbo and *.min.js are
# always excluded.
analysis:
  include:
    - "**/*"
  exclude: []
  # exclude:
  #   - "**/*.test.ts"
  #   - "scripts/**"

# Architecture rules are not implemented yet. Keep this list empty.
rules: []
```

| Field              | Type          | Meaning                                              |
| ------------------ | ------------- | ---------------------------------------------------- |
| `version`          | `1`           | Configuration format version                         |
| `project.name`     | string        | Project name                                         |
| `analysis.include` | list of globs | Files to analyze, relative to the config's directory |
| `analysis.exclude` | list of globs | Files and directories to skip                        |
| `rules`            | empty list    | Reserved; rules are not supported yet                |

Without a `deptrace.yml`, all supported files are analyzed. Glob patterns must be relative (no
leading `/`, drive letter or `..`). An invalid file is reported with exit code `2`.

## Exit codes

| Code  | Meaning                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Success. For `scan`/`deps`/`path`: the analysis completed, even if it found cycles or diagnostics                                                     |
| `1`   | Operational error (e.g. permission denied, `deptrace.yml` already exists for `init`)                                                                  |
| `2`   | Invalid usage or configuration (unknown command/option, missing directory, invalid `deptrace.yml`, file argument that is not an analyzed source file) |
| `3`   | Reserved for future architecture violations (never returned today)                                                                                    |
| `4`   | Functionality not implemented (`check`, `report`)                                                                                                     |
| `130` | Interrupted with Ctrl+C                                                                                                                               |

Whether an analysis was complete is reported in the output (`status` in JSON, the last line in
text), not in the exit code.

## Development

```sh
npm ci                 # install from the lockfile
npm run dev -- scan .  # run from source with tsx
npm run build          # bundle to dist/ with tsup
npm start -- --help    # run the built CLI
npm test               # build, then run unit and integration tests (Vitest)
npm run lint           # ESLint (typescript-eslint strict, type-checked)
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier
npm run bench          # reproducible performance benchmark
```

See [docs/development.md](docs/development.md) and [docs/architecture.md](docs/architecture.md).

## Roadmap

Planned, **not available** in this release:

- Architecture rules in `deptrace.yml` (layers, forbidden imports, cycle policies) evaluated by
  `deptrace check`, with exit code `3` on violations.
- Reports (`deptrace report`), baselines for existing violations and CI integration.
