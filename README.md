# DepTrace

**See your architecture. Catch violations before they ship.**

DepTrace is a command-line tool for analyzing the architecture of TypeScript and JavaScript
repositories. The goal is to make module boundaries visible and to fail CI when code breaks the
architecture rules a team has agreed on.

> **Status: Phase 1 (foundation).** This release contains the CLI, configuration scaffolding and
> basic repository inspection. **It does not analyze dependencies or check architecture rules
> yet.** See [What works today](#what-works-today) and [Roadmap](#roadmap).

## What works today

| Command                     | Status          | What it does                                                                                                                        |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `deptrace --help`           | Working         | Shows commands, options and examples                                                                                                |
| `deptrace --version`        | Working         | Prints the version from `package.json`                                                                                              |
| `deptrace init`             | Working         | Creates a starter `deptrace.yml`; never overwrites an existing one                                                                  |
| `deptrace scan [directory]` | Working (basic) | Shows the resolved path, `package.json` name/version, `tsconfig.json` presence and whether the directory is inside a Git repository |
| `deptrace check`            | Not implemented | Prints a notice and exits with code `4`. No checks are run                                                                          |
| `deptrace report`           | Not implemented | Prints a notice and exits with code `4`. No report is generated                                                                     |

### Current limitations

- No import resolution, dependency graph, cycle detection or rule evaluation.
- `scan` reads only the target directory listing and `package.json`. It does not recurse and does
  not count modules or dependencies.
- No command reads `deptrace.yml` yet. Its `analysis` patterns and `rules` are placeholders for
  future versions.

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

# Option A: run the built file directly
node dist/index.js --help

# Option B: link the `deptrace` command globally
npm link
deptrace --help

# Option C: install the packed tarball elsewhere
npm pack                                 # creates deptrace-cli-<version>.tgz
npm install -g ./deptrace-cli-0.1.0.tgz  # adjust to the generated file name
```

`npx deptrace` does **not** work from an unpublished checkout; use one of the options above.

## Command reference

### `deptrace init`

Creates `deptrace.yml` in the current directory.

```console
$ deptrace init
Created /home/me/my-app/deptrace.yml
Note: architecture rules are not implemented yet. This file is a starting point for future versions.
```

If `deptrace.yml` already exists, nothing is written and the command exits with code `1`. There is
no overwrite flag; delete or rename the file yourself if you want a fresh template.

### `deptrace scan [directory]`

Inspects a directory (default: the current directory). Relative paths are resolved against the
current directory.

```console
$ deptrace scan ./my-app
DepTrace repository inspection

  Directory:      /home/me/my-app
  package.json:   my-app@1.0.0
  tsconfig.json:  found
  Git repository: yes (root: /home/me/my-app)
  Status:         Phase 1 (foundation): repository inspection only

Repository inspection completed. Dependency analysis is not available in this version.
```

Git detection looks for a `.git` entry in the directory or any parent; Git does not need to be
installed.

### `deptrace check` / `deptrace report`

Registered placeholders. They print that the feature is not implemented and exit with code `4`.

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
#
# This is a Phase 1 starter template. Architecture analysis and rules are
# not implemented yet: no current command reads this file, and the settings
# below are placeholders for future versions.

project:
  name: "my-app"

# File patterns intended for future analysis. Not used by any command yet.
analysis:
  include:
    - src/**/*.ts
    - src/**/*.tsx
  exclude:
    - node_modules/**
    - dist/**
    - coverage/**

# Architecture rules are not supported in this version. Keep this list empty.
rules: []
```

Format version 1 fields: `version` (must be `1`), `project.name` (string), `analysis.include` and
`analysis.exclude` (lists of glob strings), `rules` (must be empty).

## Exit codes

| Code  | Meaning                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------- |
| `0`   | Command succeeded                                                                                                       |
| `1`   | Operational error (e.g. permission denied, `deptrace.yml` already exists)                                               |
| `2`   | Invalid usage or configuration (unknown command/option, missing directory, file instead of directory, no command given) |
| `3`   | Reserved for future architecture violations (never returned today)                                                      |
| `4`   | Functionality not implemented (`check`, `report`)                                                                       |
| `130` | Interrupted with Ctrl+C                                                                                                 |

## Development

```sh
npm ci                 # install from the lockfile
npm run dev -- --help  # run from source with tsx
npm run build          # bundle to dist/index.js with tsup
npm start -- --help    # run the built CLI
npm test               # build, then run unit and integration tests (Vitest)
npm run test:watch
npm run lint           # ESLint (typescript-eslint strict, type-checked)
npm run lint:fix
npm run typecheck      # tsc --noEmit
npm run format         # Prettier write
npm run format:check
```

See [docs/development.md](docs/development.md) and [docs/architecture.md](docs/architecture.md).

## Roadmap

Planned, **not available** in this release:

- **Phase 2:** import resolution and a module dependency graph; circular dependency detection.
- **Later:** architecture rules from `deptrace.yml` (`check`, exit code `3` on violations),
  baselines for existing violations, reports (including SARIF) and CI integration.
