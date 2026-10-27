# Development

## Requirements

- Node.js 22.12+ (CI runs 22 and 24 on Linux, Windows and macOS)
- npm (the committed `package-lock.json` is the source of truth; use `npm ci`)

## Setup

```sh
npm ci
npm run dev -- --help      # run from source (tsx)
npm run dev -- scan .
```

## Scripts

| Script                  | Command                    | Purpose                                                   |
| ----------------------- | -------------------------- | --------------------------------------------------------- |
| `npm run dev -- <args>` | `tsx src/index.ts`         | Run the CLI from source                                   |
| `npm run build`         | `tsup && vite build …`     | CLI to `dist/index.js`, dashboard to `dist/dashboard`     |
| `npm run dashboard:dev` | `vite …`                   | Dashboard with hot reload ([dashboard.md](dashboard.md))  |
| `npm run test:e2e`      | `playwright test …`        | Dashboard end-to-end tests in the installed Chrome        |
| `npm start -- <args>`   | `node dist/index.js`       | Run the built CLI                                         |
| `npm test`              | `vitest run`               | Build, then run all tests                                 |
| `npm run test:watch`    | `vitest`                   | Watch mode                                                |
| `npm run lint`          | `eslint .`                 | Lint (typescript-eslint strict, type-checked)             |
| `npm run lint:fix`      | `eslint . --fix`           | Lint and auto-fix                                         |
| `npm run typecheck`     | `tsc --noEmit && tsc -p …` | Strict type check of CLI, dashboard and tests             |
| `npm run format`        | `prettier --write .`       | Format                                                    |
| `npm run format:check`  | `prettier --check .`       | Verify formatting                                         |
| `npm run bench`         | `tsx scripts/benchmark.ts` | Reproducible benchmark ([performance.md](performance.md)) |

## Tests

- `tests/unit/` tests modules directly: config, parser, discovery and resolution
  (`analyze.test.ts`), graph construction and paths, and Tarjan's algorithm (checked against a
  brute-force reference on random graphs and on 200 000-node graphs).
- `tests/fixtures/` holds small realistic repositories: `app` (every import kind, aliases,
  packages with `exports`, assets, syntax errors, cycles), `monorepo` (workspace packages) and
  `solution-config` (tsconfig project references) and `layered` (the sample layered project for
  architecture rules, with one deliberate violation per rule type). They include a committed `node_modules`, so
  `.gitignore` re-includes `tests/fixtures/**/node_modules/`. Tests copy fixtures into temp
  directories before use; ESLint, Prettier and `tsc` ignore them.
- `docs/examples/scan-output.json` is checked against the current output by a test. Regenerate it
  with `node dist/index.js scan tests/fixtures/app --format json > docs/examples/scan-output.json`.
- `tests/integration/` spawns the built `dist/index.js` and checks stdout, stderr and exit codes.
  `baseline-cli.test.ts` runs baseline scenarios in temporary Git repositories (including a
  shallow clone). `workflows.test.ts` validates every workflow file against SchemaStore's GitHub
  workflow schema, enforces the security rules (SHA-pinned actions, no `${{ }}` in `run:`,
  least privilege, no `pull_request_target`) and runs the example workflow's shell steps with
  `bash` against the built CLI.
- `tests/fixtures/schemas/` holds the official OASIS SARIF 2.1.0 schema and SchemaStore's
  `github-workflow.json`, used with `ajv` (dev dependency) by `tests/schemas.ts`. Sources:
  <https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json>
  and <https://json.schemastore.org/github-workflow.json> (downloaded 2026-10-27).
- `tests/global-setup.ts` builds the CLI and the dashboard once before the run, so `npm test`
  always tests a fresh build. Vitest runs two projects: `cli` (Node) and `dashboard` (jsdom).
- `tests/fixtures/storefront` is the realistic dashboard fixture (layers, cycles, forbidden imports
  and packages, external packages, unresolved imports, clean files, a baseline with one new and one
  resolved entry). `dashboard/tests/fixtures/` holds its real report, check report and SARIF output;
  `tests/integration/dashboard-cli.test.ts` fails when they drift. See [dashboard.md](dashboard.md)
  for the dashboard tests and how to regenerate the fixtures.
- Security checks: `tests/unit/redaction.test.ts` (absolute paths removed from reports, terminal
  escaping), `tests/unit/source-hygiene.test.ts` (no invisible control or bidi characters in any
  repository text file), `tests/unit/trust-docs.test.ts` (policy drafts flagged for legal review,
  every placeholder listed in [trust/README.md](trust/README.md#open-placeholders), no invented
  contact details or compliance claims, documented facts match the code). CI also runs
  `npm audit --omit=dev --audit-level=high`.
- `npm run test:e2e` needs a build (`npm run build`) and Google Chrome (or set
  `PLAYWRIGHT_CHANNEL`, e.g. `msedge`); it starts `deptrace dashboard` on port 7398 itself.
- Every test works in its own temporary directory (`makeTempDir` in `tests/helpers.ts`), removed
  after each test file. Baseline and workflow tests need `git` and `bash` on the `PATH` (Git for
  Windows provides both); they set the Git identity locally.

Not covered by automated tests: Ctrl+C handling (signals cannot be sent reliably to child processes
on Windows) and the "not inside a Git repository" case (the system temp directory could itself be
inside a repository on some machines).

## Testing the package locally

```sh
npm run build
npm link            # exposes `deptrace` on your PATH
deptrace --version
npm unlink -g deptrace-cli
```

Or `npm pack` and install the resulting `.tgz` in another project. `npm pack --dry-run` lists the
files that would be published (`dist/`, `package.json`, `README.md`).

## Toolchain notes

- TypeScript is a runtime dependency (parser and module resolution) pinned to `~6.0`, because
  `typescript-eslint` 8 supports `<6.1`. `yaml` (config parsing) and `picomatch` (globs) are the
  other runtime dependencies besides `commander`.
- TypeScript 6 defaults `types` to `[]`, so `tsconfig.json` lists `"types": ["node"]`.
- The build uses tsup (esbuild). esbuild's postinstall script is not required; its platform binary
  comes from an optional dependency.
