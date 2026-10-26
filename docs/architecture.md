# Architecture

This describes the code as it exists today (through Phase 2). Analysis behavior is documented in
[analysis.md](analysis.md).

## Layers

```
src/index.ts              Executable entry: reads the version, handles Ctrl+C, sets the exit code
src/cli/                  Argument parsing and presentation (Commander)
  index.ts                Builds the program, maps every error to an exit code
  options.ts              Shared options (--format, --root), JSON printing, lazy analysis loader
  analysis.ts             Runs an analysis for a command; maps file arguments to graph nodes
  output.ts               Text formatting of scan results and edges
  commands/*.ts           One file per command
src/analysis/             Dependency analysis engine (no CLI dependencies)
  types.ts                Data model: GraphNode, GraphEdge, ImportReference, ResolutionResult, ...
  discovery.ts            Source file walk, include/exclude, built-in excludes
  parser.ts               TypeScript parsing and import extraction
  project.ts              Per-file tsconfig selection and parsing
  resolver.ts             Import resolution and classification (internal/external/...)
  graph.ts                Graph construction, shortest paths, cycle reporting
  scc.ts                  Iterative Tarjan strongly connected components
  analyze.ts              Orchestration: discovery → parse → resolve → graph → cycles → summary
  json.ts                 JSON document for `scan --format json`
  paths.ts                Path normalization (forward slashes, root-relative, realpath)
src/core/                 Shared basics
  constants.ts            Product names, config filename, exit codes
  errors.ts               DepTraceError (message + exit code), filesystem error translation
  inspect.ts              Repository metadata (package.json, tsconfig.json, Git root)
src/config/               Configuration format
  schema.ts               Config type, format version, validation
  load.ts                 Reading and validating deptrace.yml
  templates.ts            Starter template
  paths.ts                Target directory and config path resolution
  init.ts                 Writing the starter config safely
src/utils/logger.ts       stdout/stderr output, debug-only diagnostics
```

Dependencies point inward: `cli` uses `analysis`, `core`, `config` and `utils`; `analysis` uses
only its own modules and the TypeScript compiler. Analysis functions return data; only the CLI
layer prints. DepTrace's own `deptrace.yml` lets `deptrace scan` analyze this repository (test
fixtures are excluded because they contain deliberate cycles and syntax errors).

## Analysis pipeline

1. `discoverSourceFiles` walks the root once (iteratively, no symlinks) and returns sorted
   root-relative paths.
2. For each file, in order: pick its tsconfig (`ProjectLocator`), read and parse it once
   (`parseSourceFile`), extract imports (`extractImports`), resolve each specifier
   (`ImportResolver`) and drop the AST.
3. `buildGraph` turns internal resolutions into nodes, merged edges and sorted adjacency lists.
4. `findCycles` runs Tarjan's algorithm twice (all edges, runtime edges) and builds a
   representative path for every cyclic component.
5. Results are sorted and summarized into an `AnalysisResult`; `toJsonDocument` produces the
   serializable view without the absolute root.

The CLI loads this module lazily (`loadAnalysis`), so commands that do not analyze do not pay for
loading the TypeScript compiler.

## Error handling

- Expected failures throw `DepTraceError` with an `exitCode` from `ExitCode`
  (`src/core/constants.ts`).
- Filesystem errors are converted by `fromFsError`, keeping the original error as `cause`.
- Problems inside a repository (syntax errors, unresolved imports, bad tsconfig files, unreadable
  files) do not throw: they become `AnalysisDiagnostic`s and the analysis continues.
- `run()` in `src/cli/index.ts` is the single place that turns errors into exit codes:
  - Commander errors (unknown command/option, bad arguments or choices) → `2`; help/version → `0`.
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
- Analysis commands only read. They never write to the repository.
- Discovery stays inside the root and does not follow symlinks. Resolution may read package and
  tsconfig metadata outside the root (as TypeScript does) but never parses source files there.
- All paths given to TypeScript use forward slashes; all reported paths are root-relative with
  forward slashes.

## Configuration format

`deptrace.yml` has a `version` field (currently `1`). `loadConfig` parses it with `yaml` and
`validateConfig` checks the supported fields, rejecting glob patterns that could point outside the
root.
