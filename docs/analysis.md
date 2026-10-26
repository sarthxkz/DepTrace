# Dependency analysis reference

This document describes exactly what `deptrace scan`, `deptrace deps` and `deptrace path` do.

## What the analysis is (and is not)

DepTrace builds a **static import graph**: it parses source files and follows the module
specifiers written in import, export and `require` statements. It never executes repository code.

The graph is **not a complete runtime architecture map**. Static analysis cannot discover:

- imports whose specifier is computed at runtime (`import(name)`, `require(prefix + id)`);
  these are reported as `unanalyzable-import` warnings
- dependencies created by dependency injection containers or service locators
- runtime calls that are not represented by an import (globals, event buses, HTTP/RPC calls)
- reflection, `eval`, plugin loaders and other dynamic loading mechanisms
- bundler-specific loading (`require.context`, `import.meta.glob`, virtual modules)

A dependency relationship, including a circular one, is a **finding**, not an architecture policy
violation. DepTrace does not yet evaluate rules or fail builds; see [Exit codes](#exit-codes).

## Source discovery

- Extensions: `.ts .tsx .js .jsx .mts .cts .mjs .cjs` (declaration files such as `.d.ts` are
  included because they end in `.ts`).
- Patterns: `analysis.include` / `analysis.exclude` from `deptrace.yml` in the scanned directory.
  Without a `deptrace.yml`, everything (`**/*`) is included. Patterns are globs (picomatch) matched
  against root-relative paths with forward slashes. They must be relative: absolute paths, drive
  letters and `..` segments are rejected as invalid configuration.
- `*` and `**` in `include` do not match hidden files or directories (names starting with `.`)
  unless the pattern names them explicitly. `exclude` patterns do match hidden paths.
- Always excluded, at any depth: directories named `node_modules`, `.git`, `dist`, `build`,
  `coverage`, `.next`, `.turbo`, and files matching `**/*.min.js`.
- Directories matching an `exclude` pattern are not entered.
- **Symbolic links (files and directories, including Windows junctions) are never followed** and
  are counted as "Symbolic links skipped". This prevents walking outside the root, link loops and
  duplicate files.
- Unreadable directories are skipped with a `discovery-error` warning.
- Files are processed in code-unit order of their relative path, so output is deterministic.

"Source files discovered" counts files selected for analysis. "Parsed without syntax errors" and
"Parsed with syntax errors" split those files by parse result; "Unreadable" files could not be
read at all. The TypeScript parser recovers from syntax errors, so imports are still extracted from
files with errors.

## Recognized import patterns

| Pattern                                    | Kind             | Type-only |
| ------------------------------------------ | ---------------- | --------- |
| `import x from './m'`, `import { x } from` | `import`         | no        |
| `import * as ns from './m'`                | `import`         | no        |
| `import './m'`                             | `side-effect`    | no        |
| `import type { T } from './m'`             | `import`         | yes       |
| `import { type A, type B } from './m'`     | `import`         | yes       |
| `import { type A, b } from './m'`          | `import`         | no        |
| `export { x } from './m'`, `export * from` | `re-export`      | no        |
| `export * as ns from './m'`                | `re-export`      | no        |
| `export type { T } from './m'`             | `re-export`      | yes       |
| `import('./m')` (string or plain template) | `dynamic-import` | no        |
| `require('./m')` (one string argument)     | `require`        | no        |
| `import m = require('./m')`                | `import-equals`  | no\*      |
| `type T = import('./m').T`                 | `import-type`    | yes       |

\* `import type m = require('./m')` is type-only.

`require` is recognized only as a call to the identifier `require` with exactly one argument.
If a file declares its own `require` (function, variable, parameter, class or import binding),
its `require(...)` calls are ignored and reported as `shadowed-require` info diagnostics. Calls
like `obj.require('./x')` are never treated as imports.

Not recognized: `/// <reference path>` directives, JSDoc `@import` tags, `require.resolve`,
`module.require`, `createRequire(...)(...)`, `new URL('./x', import.meta.url)`, AMD `define`,
and the dynamic mechanisms listed above. Template literals with substitutions and other
non-literal specifiers produce `unanalyzable-import` warnings.

## Module resolution

Resolution uses the TypeScript compiler API (`ts.resolveModuleName`) with the settings that apply
to each file.

### Which tsconfig applies

1. For each file, the nearest `tsconfig.json` in its directory or an ancestor is used, never
   looking above the scanned root.
2. If that config has project `references` (a "solution" config such as Vite's
   `tsconfig.json` → `tsconfig.app.json` / `tsconfig.node.json`), the first referenced project,
   in declaration order, whose file list contains the file is used instead (one level deep).
3. Files with no tsconfig use defaults: `module: ESNext`, `moduleResolution: Bundler`.
4. In every case `allowJs` and `resolveJsonModule` are forced on so JavaScript and JSON targets
   resolve and can be classified.

Other config file names (for example `tsconfig.build.json`) are only used when referenced by a
`tsconfig.json`. `extends` chains are followed, including files outside the root. Invalid configs
(syntax errors, unknown values, circular `extends`) produce `tsconfig-error` diagnostics; whatever
options TypeScript could still parse are used, and defaults otherwise.

### Support matrix

| Feature                                                      | Supported | Notes                                                                                |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| Relative imports (`./a`, `../b`)                             | Yes       |                                                                                      |
| Extension resolution (`./a` → `a.ts`, `a.tsx`, `a.js`, ...)  | Yes       | TypeScript's extension priority (TS before JS) decides between candidates            |
| `.js` specifiers mapping to `.ts` sources                    | Yes       | As TypeScript does for `Node16`/`NodeNext`/`Bundler`                                 |
| Directory index (`./dir` → `dir/index.ts`)                   | Yes       | Not under `Node16`/`NodeNext` ESM rules, matching TypeScript                         |
| tsconfig `paths` aliases                                     | Yes       | Unmatched targets → `alias-not-found`                                                |
| tsconfig `baseUrl`                                           | Yes       | Deprecated in TypeScript 6 but still honoured                                        |
| `moduleResolution` `Node10`, `Node16`, `NodeNext`, `Bundler` | Yes       | ESM/CJS mode per file (`type`, `.mts`/`.cts`); `require` always resolves in CJS mode |
| package.json `exports` (subpaths, conditions)                | Yes       | With `Node16`/`NodeNext`/`Bundler`; subpaths not exported → unresolved, as in Node   |
| package.json `imports` (`#internal`)                         | Yes       | Same resolution modes as `exports`                                                   |
| Workspace packages (monorepos)                               | Yes       | When linked in `node_modules` or mapped via `paths`; resolved to the real file       |
| Node.js built-ins (`fs`, `node:fs`)                          | Yes       | External, `builtin: true`                                                            |
| Untyped JavaScript packages                                  | Yes       | External                                                                             |
| Assets (`./styles.css`, `./data.json`)                       | Yes       | "Resolved, but not analyzed" (`non-source-file`) when the file exists                |
| URL specifiers (`https://...`)                               | No        | `unsupported-specifier`                                                              |
| Bundler-only aliases (webpack/Vite `resolve.alias`)          | No        | Only tsconfig `paths` are read; such imports show up as unresolved                   |

### Classification

Every import reference gets exactly one of these outcomes:

| Outcome                        | Meaning                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal**                   | Resolved to a discovered source file. Becomes a graph edge.                                                                                                 |
| **External**                   | A Node.js built-in, or resolved into `node_modules` (and not a discovered file).                                                                            |
| **Resolved, but not analyzed** | Resolved to an existing file that is not in the graph: `non-source-file` (JSON, CSS, ...), `excluded-by-pattern`, or `outside-root`.                        |
| **Unresolved**                 | Not found: `file-not-found`, `alias-not-found`, `package-not-found`, `package-import-not-found`, `unsupported-specifier`. Each one also produces a warning. |

An import of a package that is not installed is **unresolved** (`package-not-found`), not
external: DepTrace only calls something external when it can find it.

### Paths, symlinks and the root

- All reported paths are relative to the scanned root and use forward slashes on every platform.
- Resolved files are passed through `realpath`, so an import through a symlink (for example a
  workspace link in `node_modules`) points to the real file. If that real file is a discovered
  source file, the import is internal.
- Files outside the root never become graph nodes and are never parsed. Imports that resolve
  outside the root are reported as `outside-root` without the absolute target path.
- Resolution may read metadata outside the root, as Node.js and TypeScript do: `package.json` files
  in ancestor `node_modules` directories and `extends`-ed tsconfig files.

## Dependency graph

- **Nodes**: every discovered source file, identified by its root-relative path. Each node has
  `extension`, `status` (`parsed`, `parse-errors`, `unreadable`) and the `tsconfig` used.
- **Edges**: directed, from the importing file to the imported file. All imports between the same
  two files are **merged into one edge**; every individual import is kept in the edge's
  `references` (specifier, kind, type-only flag, line, column). An edge is `typeOnly` only when
  all of its references are type-only.
- External packages are **not** nodes; they are listed separately under `externalDependencies`.
- Nodes are sorted by id, edges by (from, to), references by position.

## Circular dependencies

DepTrace computes **strongly connected components** (SCCs) with an iterative version of Tarjan's
algorithm (O(V + E), no recursion, so deep graphs cannot overflow the stack).

- A component is **cyclic** when it has more than one file, or one file that imports itself.
- Every other component is a single acyclic file; the summary counts all components, but only
  cyclic ones are listed.
- For each cyclic component DepTrace reports:
  - `nodes`: all files in the component
  - `representativePath`: **one** shortest cycle through the component's first file
    (alphabetically), found by breadth-first search
  - `edges`: every edge between files of the component, with source locations
  - `runtime`: `false` when the cycle exists only through type-only imports (it disappears after
    TypeScript erases types); computed by a second SCC pass over runtime edges only
- **An SCC can contain many distinct cycles.** The representative path is an example, not a
  complete list. All cycles are deliberately not enumerated, because their number can grow
  exponentially with the size of the component. To break a component, look at its `edges`.

## Inspecting dependencies

All three commands run a fresh analysis (results are not cached between commands).

- `deptrace deps <file> [--direction outgoing|incoming|both] [--root <dir>] [--format text|json]`
  - `outgoing` (default): what `<file>` imports: internal files, external packages, resolved but
    not analyzed targets and unresolved imports.
  - `incoming`: which internal files import `<file>`. Only direct importers are listed.
  - `both`: both lists. The output also says whether the file is part of a cyclic component.
- `deptrace path <from> <to> [--root <dir>] [--format text|json]` prints one shortest path
  following import direction (from importer to imported), or says that none exists. When several
  shortest paths exist, the one visiting alphabetically smaller files first is chosen.

File arguments are resolved like any CLI path: relative to the current directory (or absolute),
not relative to `--root`. They must exist, be inside the root and be analyzed source files;
otherwise the command exits with code 2. On Windows both `\` and `/` separators work.

## JSON output

`deptrace scan --format json` prints one JSON document to stdout. Progress and errors go to
stderr, so stdout is always valid JSON. Only repository-relative paths are included; the absolute
root, user names and environment are not. Values are never `undefined` (`null` is used).

A complete example generated from `tests/fixtures/app` is in
[examples/scan-output.json](examples/scan-output.json) (a test keeps it up to date).

| Field                      | Description                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`            | `1`. Incremented on incompatible changes.                                                                                                  |
| `tool`                     | `{ name, version }` of DepTrace.                                                                                                           |
| `status`                   | `completed` or `completed-with-diagnostics` (any error or warning).                                                                        |
| `repository`               | `{ packageName, packageVersion, git }` from `package.json` and `.git` detection.                                                           |
| `settings`                 | `configFile`, `include`, `exclude`, `builtinExcludedDirectories`, `builtinExcludedFiles`, `extensions`, `tsconfigs` (used tsconfig files). |
| `summary`                  | Counts (see below) and `durationMs`.                                                                                                       |
| `nodes[]`                  | `{ id, path, extension, status, tsconfig }`                                                                                                |
| `edges[]`                  | `{ from, to, typeOnly, references[] }`; reference = `{ specifier, kind, typeOnly, line, column }`                                          |
| `cycles[]`                 | `{ nodes[], representativePath[], edges[], runtime }`                                                                                      |
| `externalDependencies[]`   | `{ packageName, builtin, references[] }`; reference adds `file`                                                                            |
| `unresolvedDependencies[]` | reference with `file` and `reason`                                                                                                         |
| `excludedDependencies[]`   | reference with `file`, `reason` and `target` (`null` for `outside-root`)                                                                   |
| `diagnostics[]`            | `{ severity, code, message, file, line, column }`                                                                                          |

`summary` fields: `filesDiscovered`, `directoriesExcluded`, `filesExcluded`, `symlinksSkipped`,
`unreadableDirectories`, `filesParsed` (without syntax errors), `filesWithParseErrors`,
`filesUnreadable`, `importReferences`, `internalReferences`, `externalReferences`,
`externalPackages`, `excludedReferences`, `unresolvedReferences`, `unanalyzableImports`, `nodes`,
`edges`, `typeOnlyEdges`, `stronglyConnectedComponents`, `cyclicComponents`, `runtimeCycles`,
`errors`, `warnings`, `durationMs`.

`importReferences = internalReferences + externalReferences + excludedReferences +
unresolvedReferences`. Unanalyzable imports have no specifier and are counted separately.
`internalReferences` can exceed `edges` because parallel imports are merged.

Everything except `summary.durationMs` is deterministic for the same input.

`deptrace deps --format json` returns `{ schemaVersion, file, direction, outgoing, incoming, cycle }`
(`outgoing`/`incoming` are `null` when not requested). `deptrace path --format json` returns
`{ schemaVersion, from, to, path, steps }` with `path: null` when no path exists.

## Diagnostics

| Code                  | Severity | Meaning                                                         |
| --------------------- | -------- | --------------------------------------------------------------- |
| `parse-error`         | error    | The file has syntax errors (first error shown, plus a count).   |
| `read-error`          | error    | A discovered file could not be read.                            |
| `tsconfig-error`      | error    | A tsconfig could not be parsed or has invalid settings.         |
| `unresolved-import`   | warning  | An import could not be resolved; the reason is in the message.  |
| `unanalyzable-import` | warning  | `import()`/`require()` with a non-literal specifier.            |
| `discovery-error`     | warning  | A directory could not be read and was skipped.                  |
| `shadowed-require`    | info     | `require()` ignored because the file defines its own `require`. |

Any error or warning sets `status` to `completed-with-diagnostics` and the text report ends with
"Analysis completed with diagnostics", because the graph may be missing dependencies.

## Exit codes

| Code | `scan`, `deps`, `path`                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | The analysis completed, **with or without** cycles and diagnostics. Check `status`.                                                              |
| `1`  | Operational failure (for example the root directory cannot be read).                                                                             |
| `2`  | Invalid usage or configuration: missing/non-directory root, invalid `deptrace.yml`, unknown option value, unknown or non-analyzed file argument. |
| `3`  | Reserved for future policy violations. Never returned today.                                                                                     |

Detection is deliberately separate from enforcement: there is no failure policy yet, so cycles do
not change the exit code. `deptrace path` exits `0` whether or not a path exists.

## Limitations

- Bundler aliases outside tsconfig `paths`, and bundler-specific loaders, are not understood.
- Only one level of tsconfig project `references` is followed, and only from a `tsconfig.json`.
- Within a single tsconfig, files are resolved with that config even if its `include`/`files`
  would not list them.
- Import attributes (`with { type: 'json' }`) are ignored; resolution is by specifier only.
- Results are not cached; each command re-analyzes the repository.
- If a project defines a local path alias with the same name as a Node.js built-in (for example
  `fs`), the built-in wins.
