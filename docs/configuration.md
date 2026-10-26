# Configuration reference

DepTrace reads `deptrace.yml` from the directory being scanned or checked (the `[directory]`
argument or `--root`, default: current directory). `deptrace init` creates a starter file and
never overwrites an existing one. DepTrace never writes to `deptrace.yml` otherwise.

```yaml
version: 1

project:
  name: 'my-app'

analysis:
  include: ['**/*']
  exclude: ['**/*.test.ts']

layers:
  - name: ui
    files: ['src/ui/**']
  - name: domain
    files: ['src/domain/**']

rules:
  layer-boundaries:
    severity: error
    allowed:
      ui: [domain]
      domain: []
  circular-dependencies:
    severity: warning
```

## Top-level settings

| Setting            | Required | Type                    | Meaning                                                                                          |
| ------------------ | -------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `version`          | yes      | `1`                     | Configuration format version                                                                     |
| `project.name`     | yes      | string                  | Project name                                                                                     |
| `analysis.include` | yes      | list of globs           | Files to analyze ([details](analysis.md#source-discovery))                                       |
| `analysis.exclude` | yes      | list of globs           | Files and directories not analyzed at all (they are not graph nodes and no rule sees them)       |
| `layers`           | no       | list of `{name, files}` | Architecture layers used by `layer-boundaries` and `deptrace report`                             |
| `rules`            | yes      | mapping, or `[]`        | Architecture rules ([rule catalog](rules.md)); `[]` (the format before rules existed) means none |

Unknown settings are rejected, which catches typos such as `rulez` or `severty`.

## Layers

```yaml
layers:
  - name: presentation # lowercase letters, digits and "-"; unique
    files: ['src/presentation/**'] # at least one glob
```

A file belongs to the first layer whose patterns match it.

## Rules

`rules` is a mapping from rule type to its settings:

| Key                     | Value                     |
| ----------------------- | ------------------------- |
| `layer-boundaries`      | one rule                  |
| `forbidden-imports`     | list of rules with `name` |
| `forbidden-packages`    | list of rules with `name` |
| `module-boundaries`     | list of rules with `name` |
| `circular-dependencies` | one rule                  |

See [rules.md](rules.md) for every setting, its default and the exact semantics.

## Patterns

All patterns (`analysis`, `layers.files`, rule `from`/`to`/`exclude`/`modules`/`public`) are
[picomatch](https://github.com/micromatch/picomatch) globs matched against paths relative to the
configuration's directory, with forward slashes:

- `src/**` (everything under `src`), `src/*.ts`, `**/*.test.ts`, `src/{ui,api}/**`
- Patterns must not be empty, start with `/`, start with a drive letter (`C:`), contain a `..`
  segment, or contain backslashes. This keeps every pattern inside the repository and makes
  configurations portable between Windows and POSIX.
- Rule patterns also match hidden files. `analysis.include` does not, unless the pattern names
  them (see [analysis.md](analysis.md#source-discovery)).

## Validation errors

Invalid configuration stops `scan`, `deps`, `path`, `check` and `report` with exit code 2 and a list
of every problem, each with its location:

```text
error: Invalid deptrace.yml at /home/me/app/deptrace.yml:
  - rules.layer-boundaries.allowed.ui[0]: unknown layer "domian" (defined: "ui", "domain")
  - rules.layer-boundaries.allowed: missing layer "domain" (list the layers it may import, or [] for none)
  - rules.circular-dependencies.severty: unknown setting (supported: "severity", "description", "exclude", "ignore-type-only")
```
