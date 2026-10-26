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

| Script                  | Command              | Purpose                                       |
| ----------------------- | -------------------- | --------------------------------------------- |
| `npm run dev -- <args>` | `tsx src/index.ts`   | Run the CLI from source                       |
| `npm run build`         | `tsup`               | Bundle to `dist/index.js` (ESM, shebang)      |
| `npm start -- <args>`   | `node dist/index.js` | Run the built CLI                             |
| `npm test`              | `vitest run`         | Build, then run all tests                     |
| `npm run test:watch`    | `vitest`             | Watch mode                                    |
| `npm run lint`          | `eslint .`           | Lint (typescript-eslint strict, type-checked) |
| `npm run lint:fix`      | `eslint . --fix`     | Lint and auto-fix                             |
| `npm run typecheck`     | `tsc --noEmit`       | Strict type check of sources and tests        |
| `npm run format`        | `prettier --write .` | Format                                        |
| `npm run format:check`  | `prettier --check .` | Verify formatting                             |

## Tests

- `tests/unit/` tests modules directly (config template, validation, init, inspection).
- `tests/integration/` spawns the built `dist/index.js` and checks stdout, stderr and exit codes.
- `tests/global-setup.ts` builds the CLI once before the run, so `npm test` always tests a fresh
  build.
- Every test works in its own temporary directory (`makeTempDir` in `tests/helpers.ts`), removed
  after each test. Tests do not depend on Git being installed or configured.

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

- TypeScript is pinned to `~6.0` because `typescript-eslint` 8 supports `<6.1`.
- TypeScript 6 defaults `types` to `[]`, so `tsconfig.json` lists `"types": ["node"]`.
- The build uses tsup (esbuild). esbuild's postinstall script is not required; its platform binary
  comes from an optional dependency.
