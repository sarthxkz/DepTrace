# Architecture rules

`deptrace check` evaluates the rules in `deptrace.yml` against the dependency graph described in
[analysis.md](analysis.md). `deptrace report` shows the same results together with the layer
structure. The configuration format itself is described in [configuration.md](configuration.md).

## How rules see your code

- Rules evaluate **statically detected imports only**. Imports that could not be resolved, imports
  with computed specifiers, dependency injection and other runtime relationships are not seen, so
  a passing check does not prove the absence of runtime coupling. When the analysis reported
  diagnostics, `check` says so ("Analysis: completed with diagnostics").
- Unresolved imports are **not** violations. The one exception is `forbidden-packages`, which also
  matches bare imports of packages that are not installed, because the import names the package
  regardless (such violations have `target.resolved: false`).
- Cycles are **not** violations unless the `circular-dependencies` rule is configured.
- Paths in patterns are root-relative globs with forward slashes, on every platform.

## Common settings

Every rule accepts:

| Setting            | Default   | Meaning                                                                                            |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------- |
| `severity`         | `error`   | `error` fails `check`; `warning` is reported (fails only with `--strict`); `off` disables the rule |
| `description`      | generated | Text explaining the rule, shown with each violation                                                |
| `exclude`          | `[]`      | Globs of **importing** files exempt from the rule (their imports are not checked)                  |
| `ignore-type-only` | `false`   | Do not check type-only imports (`import type`, `export type`, `import("x").T`)                     |

For `circular-dependencies`, `exclude` removes matching files from cycle detection entirely.

`forbidden-imports`, `forbidden-packages` and `module-boundaries` are **lists** of rules; each needs
a unique `name` (lowercase letters, digits, `-`). Their rule id is `<type>/<name>`. The other two
types are single rules whose id is the type.

## Rule catalog

### `layer-boundaries`

Assigns files to layers and allows only listed **importer → imported** directions.

```yaml
layers:
  - name: presentation
    files: ['src/presentation/**']
  - name: application
    files: ['src/application/**']
  - name: domain
    files: ['src/domain/**']
  - name: infrastructure
    files: ['src/infrastructure/**']

rules:
  layer-boundaries:
    severity: error
    allowed: # importer layer: [layers it may import]
      presentation: [application]
      application: [domain]
      domain: [] # domain imports no other layer
      infrastructure: [application, domain]
    exclude: ['src/main.ts'] # composition root may wire everything
```

- A file belongs to the **first** layer (in `layers` order) whose `files` patterns match it. Put
  more specific layers first.
- Imports within the same layer are always allowed.
- Files in no layer are not checked, neither as importer nor as imported file. `deptrace report`
  lists how many files have no layer.
- `allowed` must list **every** layer (use `[]` for none), so a forgotten layer is a configuration
  error rather than a silent "allow nothing". Allowed directions are not transitive:
  `presentation: [application]` does not allow `presentation` to import `domain`.
- One violation per importing file and imported file; all imports between them are listed.
- Violation metadata: `fromLayer`, `toLayer`.

### `forbidden-imports`

Forbids imports from files matching `from` to files matching `to`.

```yaml
rules:
  forbidden-imports:
    - name: no-legacy
      description: New code must not use the legacy helpers
      severity: warning
      from: ['src/**']
      to: ['src/legacy/**']
      exclude: ['src/legacy/**'] # legacy code may still use itself
```

`to` matches analyzed source files only. To forbid packages, use `forbidden-packages`.

### `forbidden-packages`

Forbids importing packages (and Node.js built-ins) from files matching `from` (default: all files).

```yaml
rules:
  forbidden-packages:
    - name: pure-domain
      from: ['src/domain/**']
      packages: ['express', 'pg', '@nestjs/*', 'fs']
```

- `packages` are globs on the package name: `@nestjs/*` matches every `@nestjs` package;
  `lodash` also covers `lodash/fp`. Built-ins are named without `node:` (`fs` matches `node:fs`).
- One violation per file and package; all imports of that package from the file are listed.
- Packages that are not installed are matched by name from the import (`target.resolved: false`).

### `module-boundaries`

Isolates modules (for example features) from each other's internals.

```yaml
rules:
  module-boundaries:
    - name: features
      modules: ['src/features/*'] # every matching directory is one module
      public: ['index.ts'] # files other modules may import, relative to the module
```

- A file belongs to the module of its **shallowest** ancestor directory matching `modules`.
- An import from module A to a different module B is a violation unless the imported file,
  relative to B's directory, matches `public`. With `public: []`, modules may not import each
  other at all.
- Imports within a module, and imports from or to files outside every module, are not checked.
- Violation metadata: `fromModule`, `toModule`.

### `circular-dependencies`

Turns detected cycles into violations.

```yaml
rules:
  circular-dependencies:
    severity: warning
    ignore-type-only: true # cycles made only of type imports vanish at runtime
```

- Cycles are recomputed on the graph the rule sees (without excluded files and, if configured,
  without type-only imports), using the same SCC algorithm as `scan`.
- One violation per cyclic strongly connected component: `target.files` lists all its files,
  `path` shows one representative cycle. A component can contain more cycles than the one shown.

## Violations

Each violation (JSON field names):

| Field             | Meaning                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `ruleId`          | Stable rule id, e.g. `layer-boundaries`, `forbidden-packages/pure-domain`                     |
| `ruleType`        | One of the five rule types                                                                    |
| `ruleDescription` | The rule's `description`, or a generated one                                                  |
| `severity`        | `error` or `warning`                                                                          |
| `file`            | Importing file (cycles: the component's first file), repository-relative                      |
| `line`, `column`  | Position of the first offending import (1-based)                                              |
| `target`          | `{ kind: "file", path }`, `{ kind: "package", name, resolved }` or `{ kind: "cycle", files }` |
| `dependencyKinds` | Import kinds involved (`import`, `require`, `dynamic-import`, ...)                            |
| `typeOnly`        | True when every offending import is type-only                                                 |
| `references`      | The offending imports: `{ specifier, kind, typeOnly, line, column }`                          |
| `message`         | Human-readable explanation                                                                    |
| `path`            | `[importer, imported]`, the representative cycle, or `null` for packages                      |
| `fingerprint`     | Stable identity (see below)                                                                   |
| `metadata`        | Rule-specific details (layers, modules, component size)                                       |

**Fingerprints** are the first 16 hex characters of SHA-256 over the rule id and the
repository-relative identity of the violation (importer and imported file, importer and package,
or the sorted files of a cycle). They contain no line numbers and no absolute paths, so they stay
the same when code moves within a file, when the repository is cloned elsewhere, and across
operating systems. They change when a file is renamed or a cycle gains or loses files. Each rule
reports a dependency at most once.

Violations are sorted by file, line, column, rule id and fingerprint, so output is deterministic.

## Commands

### `deptrace check [directory]`

| Option              | Meaning                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `--format json`     | Machine-readable result on stdout                                                                      |
| `--format github`   | Text report plus GitHub annotations ([github-actions.md](github-actions.md))                           |
| `--strict`          | Warning violations also fail the check                                                                 |
| `--baseline <file>` | Only violations not in the baseline fail ([baseline.md](baseline.md))                                  |
| `--report <file>`   | Also write the JSON document below to a file                                                           |
| `--sarif <file>`    | Also write a SARIF 2.1.0 log ([github-actions.md](github-actions.md#sarif-and-code-scanning-optional)) |
| `--summary <file>`  | Append a Markdown summary (for `$GITHUB_STEP_SUMMARY`)                                                 |
| `--verbose`         | Show each violation's fingerprint (text mode)                                                          |

Exit codes:

| Code | Meaning                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | No failing violations (warnings are allowed unless `--strict`). Also when every rule has severity `off`                                             |
| `3`  | At least one error violation (with `--strict`: or warning; with `--baseline`: only new ones count). The reason is printed to stderr                 |
| `2`  | No `deptrace.yml`, invalid configuration, no rules configured (a check with nothing to check fails), or a missing, invalid or incompatible baseline |
| `1`  | Operational error                                                                                                                                   |

Example (the sample project in `tests/fixtures/layered`):

```console
$ deptrace check
DepTrace architecture check

Rules
  error   layer-boundaries                         3 violations
  warning forbidden-imports/no-legacy              1 violation
  error   forbidden-packages/pure-domain           1 violation
  error   module-boundaries/features               1 violation
  warning circular-dependencies                    1 violation

Violations: 5 errors, 2 warnings
  ...
  error   src/domain/pricing.ts:2:22  [layer-boundaries]
          Layer "domain" must not depend on layer "infrastructure" (allowed for "domain": none). src/domain/pricing.ts imports src/infrastructure/db/connection.ts.
          imports: "../infrastructure/db/connection" import 2:22
  ...

Analysis: complete (20 files, 26 dependencies).
error: Architecture check failed: 5 failing violations.
```

`check --format json` prints:

```json
{
  "schemaVersion": 1,
  "tool": { "name": "deptrace", "version": "..." },
  "result": "failed",
  "strict": false,
  "summary": { "rules": 5, "enabledRules": 5, "errors": 5, "warnings": 2, "failing": 5 },
  "analysis": {
    "status": "completed",
    "errors": 0,
    "warnings": 0,
    "unresolvedReferences": 0,
    "filesWithParseErrors": 0
  },
  "rules": [
    {
      "id": "layer-boundaries",
      "type": "layer-boundaries",
      "description": "...",
      "severity": "error",
      "violations": 3
    }
  ],
  "violations": [{ "ruleId": "...", "...": "see the table above" }]
}
```

`summary.failing` counts the violations that make the check fail. With `--baseline`, each
violation also has `baselineStatus` (`new` or `existing`), `result` and `summary.failing` count
only new violations, and a `baseline` object is added: `file` (relative to the analyzed
directory, or only its name when it is outside), `new`, `existing`, `resolved` and `resolvedViolations` (the baseline entries no
longer found).

### `deptrace report [directory]`

Prints an analysis summary, layers with their file counts, dependencies between layers (marked
allowed / NOT ALLOWED when `layer-boundaries` is configured), rule results, violations and cycles.
`--verbose` lists the files of each layer. It works without a `deptrace.yml` (no layers, no rules)
and **always exits 0** when the analysis completes: it informs, `check` enforces.

`report --format json` prints the `scan --format json` document plus an `architecture` object:
`layers` (`name`, `patterns`, `files`), `unlayeredFiles`, `layerDependencies` (`from`, `to`, `edges`,
`typeOnlyEdges`), `layerRule` (the `layer-boundaries` rule's `id`, `severity` and `allowed` map, or
`null` when there is none), `rules`, `violations`, `errors`, `warnings`. This document is what
`deptrace dashboard` shows ([dashboard.md](dashboard.md)).

`report --baseline <file>` compares the violations with a baseline exactly like
`check --baseline` (an invalid or incompatible baseline is exit code `2`): the text report marks
each violation `new` or `existing` and lists resolved entries, and the JSON adds
`baselineStatus` to each violation and `architecture.baseline` (`file`, `new`, `existing`,
`resolved`, `resolvedViolations`). The exit code stays `0`.

SARIF output is available with `check --sarif <file>`.

## Sample project

[`tests/fixtures/layered`](../tests/fixtures/layered) is a small layered shop
(presentation/application/domain/infrastructure plus feature modules) with a complete
`deptrace.yml` and seven deliberate violations, each marked with a `VIOLATION` comment. Try:

```sh
npm run build
node dist/index.js check tests/fixtures/layered
node dist/index.js report tests/fixtures/layered
```

DepTrace's own [`deptrace.yml`](../deptrace.yml) is a second, clean example: it enforces the
layering of this repository and passes.

## Troubleshooting

- **"No deptrace.yml found" / "No architecture rules are configured" (exit 2)**: `check` refuses
  to pass when there is nothing to check. Run `deptrace init` and add rules.
- **A file is not checked by `layer-boundaries`**: it is probably in no layer, or in an earlier
  layer than expected (first match wins). `deptrace report --verbose` lists every layer's files.
- **An expected violation is missing**: the import may be unresolved or computed at runtime. Run
  `deptrace scan` and look at the diagnostics, or `deptrace deps <file>` for the file's imports.
  Also check `exclude` and `ignore-type-only`.
- **Patterns do not match on Windows**: use forward slashes (`src/**`); backslashes are rejected.
- **A violation's fingerprint changed**: the importing or imported file was renamed or moved, or
  (for cycles) the set of files in the cycle changed.
- **Too many cycle violations from type declarations**: set `ignore-type-only: true` on
  `circular-dependencies`.

## Limitations

- Rules see only static imports (see [analysis.md](analysis.md#what-the-analysis-is-and-is-not)).
- `layer-boundaries` does not check files outside all layers, and allowed directions are not
  transitive.
- There are no per-violation suppressions; use `exclude` for exemptions, or a
  [baseline](baseline.md) to accept existing violations.
- `to` in `forbidden-imports` cannot target packages, and `forbidden-packages` cannot target
  files.
