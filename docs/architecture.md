# Architecture

This describes the code as it exists in Phase 1. Planned features are listed only where they
influence today's structure.

## Layers

```
src/index.ts            Executable entry: reads the version, handles Ctrl+C, sets the exit code
src/cli/                Argument parsing and presentation (Commander)
  index.ts              Builds the program, maps every error to an exit code
  commands/*.ts         One file per command: registers it and formats its output
src/core/               Logic with no CLI dependencies
  constants.ts          Product names, config filename, exit codes
  errors.ts             DepTraceError (message + exit code), filesystem error translation
  inspect.ts            Lightweight repository inspection used by `scan`
src/config/             Configuration format
  schema.ts             Config type, format version, validation of supported fields
  templates.ts          Starter template rendering
  paths.ts              Target directory and config path resolution
  init.ts               Writing the starter config safely
src/utils/logger.ts     stdout/stderr output, debug-only diagnostics
```

Dependencies point inward: `cli` uses `core`, `config` and `utils`; `core` and `config` never
import from `cli`. Core functions return data or throw `DepTraceError`; only the CLI layer prints.

## Error handling

- Expected failures throw `DepTraceError` with an `exitCode` from `ExitCode`
  (`src/core/constants.ts`).
- Filesystem errors are converted by `fromFsError`, keeping the original error as `cause`.
- `run()` in `src/cli/index.ts` is the single place that turns errors into exit codes:
  - Commander errors (unknown command/option, bad arguments) → `2`; help/version → `0`.
  - `DepTraceError` → its own code, message on stderr.
  - Anything else → `1`, reported as an unexpected error.
- Stack traces are printed only with `--debug`. The flag is read from the raw arguments so it also
  works when argument parsing fails.
- The entry point sets `process.exitCode` instead of calling `process.exit()`, so output is flushed.
  The only `process.exit()` is the single `SIGINT` handler (registered with `process.once`).

## Version

`src/index.ts` loads `../package.json` at runtime. The path is the same from `src/` (dev via tsx)
and `dist/` (built), so the version lives only in `package.json`.

## Filesystem behavior

- `init` writes exactly one file, `<cwd>/deptrace.yml`, using the `wx` flag so an existing file is
  never replaced (no check-then-write race).
- `scan` calls `stat` and `readdir` on the target, reads `package.json` if present, and stats
  `.git` in the target and its ancestors. Nothing is written and nothing is read recursively.
- All paths go through `node:path`, so Windows, macOS and Linux behave the same.

## Configuration format

`deptrace.yml` has a `version` field (currently `1`). `validateConfig` in `src/config/schema.ts`
checks only the fields of version 1. No command loads the file yet; YAML parsing will be added
together with the first feature that needs it. Tests parse the template with the `yaml` dev
dependency to guarantee it is valid.
