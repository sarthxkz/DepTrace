# Baselines

A baseline records the architecture violations that exist today and that you have decided to
accept for now. `deptrace check --baseline <file>` then fails only on violations that are **not**
in the baseline. This lets you adopt DepTrace in a codebase with existing violations and stop new
ones immediately, while you fix the old ones over time.

## Two check modes

| Mode           | Command                            | Fails (exit `3`) when                                        |
| -------------- | ---------------------------------- | ------------------------------------------------------------ |
| Full (default) | `deptrace check`                   | any error violation exists (with `--strict`: or warning)     |
| Baseline-aware | `deptrace check --baseline <file>` | any error violation is **new** (with `--strict`: or warning) |

In both modes every current violation is reported. Baseline mode marks each one as `new` or
`existing` and also lists **resolved** baseline entries (accepted violations that are gone). It
never hides existing violations and never treats a missing or broken baseline as empty.

The full check stays the safe default: use baseline mode only while you have accepted violations.

## Commands

```sh
deptrace baseline create [directory] [--file <path>]   # never overwrites an existing file
deptrace baseline update [directory] [--file <path>]   # replaces an existing file, explicitly
deptrace check [directory] --baseline <path>
```

The default baseline file is `<directory>/deptrace-baseline.json`. `--file` and `--baseline` paths
are relative to the current directory.

```console
$ deptrace baseline create
Created deptrace-baseline.json with 7 accepted violations (5 errors, 2 warnings).
Review it and commit it. "deptrace check --baseline deptrace-baseline.json" then fails only on violations not in it.
Analysis: complete (20 files, 26 dependencies).

$ deptrace check --baseline deptrace-baseline.json
...
Violations: 6 errors, 2 warnings
  warning existing  src/application/notify.ts:1:28  [circular-dependencies]
          Circular dependency between 2 file(s): src/application/notify.ts -> src/application/place-order.ts -> src/application/notify.ts.
  error   new       src/domain/audit.ts:1:8  [layer-boundaries]
          Layer "domain" must not depend on layer "infrastructure" (allowed for "domain": none). src/domain/audit.ts imports src/infrastructure/db/connection.ts.
          imports: "../infrastructure/db/connection" side-effect 1:8
  error   existing  src/domain/pricing.ts:1:30  [forbidden-packages/pure-domain]
  ...
Baseline: deptrace-baseline.json (1 new, 7 existing, 0 resolved)

Analysis: complete (21 files, 27 dependencies).
error: Architecture check failed: 1 new failing violation (7 existing violations accepted by the baseline).
```

(The sample project `tests/fixtures/layered` with one added file, `src/domain/audit.ts`.)

| Exit code | `baseline create` / `update`                                         | `check --baseline`                                                   |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `0`       | Written                                                              | No new failing violation                                             |
| `1`       | `create`: the file already exists (not modified); I/O errors         | I/O errors                                                           |
| `2`       | No `deptrace.yml`, no rules, invalid config; `update` without a file | Baseline missing, unreadable, invalid or incompatible; config errors |
| `3`       |                                                                      | New failing violations                                               |

## Approving and updating a baseline

The baseline is an allowlist: every entry accepts a violation. Treat changes to it like code.

1. **Create** it once with `deptrace baseline create`, review the entries and commit the file.
2. **New violations** fail the check. Fix them. If one is truly intentional, run
   `deptrace baseline update` in the same branch and commit the change; the pull request diff then
   shows exactly which violations are being accepted (`ruleId`, `file`, `target`, `message`), and
   a reviewer approves them.
3. **Resolved entries** do not fail the check, but they should be removed with
   `deptrace baseline update`: otherwise the same violation could come back and be accepted
   silently. `check` and the CI summary point them out.
4. Protect the file: add it to `CODEOWNERS` and require code owner review on the default branch,
   so a pull request cannot accept its own violations without approval. The
   [example workflow](github-actions.md) also flags pull requests that change the baseline.

Never update the trusted baseline automatically from CI, and especially not from pull requests:
DepTrace has no command that does, and the provided workflows only read it.

`update` prints how many entries were added, removed and kept. It replaces the file atomically
(write to a temporary file in the same directory, then rename), so an interrupted run leaves the
old file intact. If the old baseline is invalid or incompatible (see below), `update` replaces it
and says why the old one could not be used. `create` reserves the file name atomically and fails
if anything, even a symlink, already exists there.

## File format

```json
{
  "schemaVersion": 1,
  "tool": { "name": "deptrace", "version": "0.4.0" },
  "fingerprintVersion": 1,
  "configuration": {
    "analysis": "728e7b148c34dae3",
    "rules": {
      "circular-dependencies": "2c7a0902159a2933",
      "layer-boundaries": "5918b3c90108c0d1"
    }
  },
  "violations": [
    {
      "fingerprint": "63d9639e32a7e374",
      "ruleId": "layer-boundaries",
      "file": "src/domain/pricing.ts",
      "target": { "kind": "file", "path": "src/infrastructure/db/connection.ts" },
      "message": "Layer \"domain\" must not depend on layer \"infrastructure\" ..."
    }
  ]
}
```

| Field                | Meaning                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `schemaVersion`      | Format version (`1`). Other versions are rejected.                                            |
| `tool`               | Name and version of the DepTrace that wrote it. Informational only.                           |
| `fingerprintVersion` | Version of the fingerprint algorithm (below). Must equal the running DepTrace's.              |
| `configuration`      | Digests of what the baseline was approved against (see [Compatibility](#compatibility)).      |
| `violations`         | Accepted violations, sorted by file, rule id and fingerprint. Only `fingerprint` is compared. |

The file is deterministic: the same code and configuration produce the same bytes on every
machine, checkout directory and operating system. It contains no timestamps, no absolute paths and
no line numbers, so moving code within a file does not change it. Paths are repository-relative
with forward slashes.

## Fingerprints

A violation's fingerprint is the first 16 hex characters of SHA-256 over the rule id and the
repository-relative identity of the violation:

| Rule type                                                    | Identity                             |
| ------------------------------------------------------------ | ------------------------------------ |
| `layer-boundaries`, `forbidden-imports`, `module-boundaries` | importing file, imported file        |
| `forbidden-packages`                                         | importing file, package name         |
| `circular-dependencies`                                      | sorted files of the cyclic component |

They are stable across machines, checkout directories, Windows/Linux/macOS, repeated runs, and CI
versus local runs (tests compare golden values and relocated copies). They change, by design, when:

- a file is **renamed or moved** (the violation shows up as one new and one resolved entry; update
  the baseline in the same change);
- a rule is **renamed** (its id is part of the fingerprint);
- a cycle **gains or loses files**.

`FINGERPRINT_VERSION` (`src/rules/fingerprint.ts`) is bumped whenever the algorithm changes. A
baseline with another fingerprint version is rejected with a message to recreate it
(`deptrace baseline update`), because comparing fingerprints from different algorithms would mark
everything as new and resolved.

### Duplicates and multiplicity

Each rule reports a given dependency at most once: all imports between the same two files (or of
the same package from one file) form **one** violation with several `references`. So fingerprints
are unique within one run, and a baseline with a duplicate fingerprint is rejected as malformed
instead of being counted twice.

Trade-off: adding a second import between two files that already have an accepted violation is
not a new violation. The baseline accepts the dependency, not a number of import statements.
Counting occurrences would make the baseline depend on line-level details and churn with every
edit.

## Compatibility

Comparing against a baseline only makes sense under the rules it was approved with. The
`configuration` section stores digests (SHA-256, 16 hex characters) of:

- `analysis.include` and `analysis.exclude` (which files exist for the rules);
- each **enabled** rule's definition, including the `layers` for `layer-boundaries`.

Key order in YAML does not matter. **Severity and description are not included**: changing a rule
from `warning` to `error` does not change which violations exist, so the baseline stays valid
(accepted violations stay accepted; new ones fail with the new severity).

`check --baseline` fails with exit code `2` and lists every difference when:

```text
error: The baseline deptrace-baseline.json does not match the current configuration:
  - rule "forbidden-packages/pure-domain" changed
  - rule "forbidden-imports/no-console" is enabled but not in the baseline
  - rule "circular-dependencies" was removed or turned off
  - analysis.include or analysis.exclude changed
A baseline is only valid for the rules it was approved under. Review the change, run "deptrace baseline update" and commit the result.
```

It also fails (exit `2`) when the file is missing, not JSON, larger than 64 MB, has another
`schemaVersion` or `fingerprintVersion`, unknown fields, malformed entries, entries for rules not
in `configuration.rules`, duplicate fingerprints, or paths that are absolute, contain `..` or
backslashes. At most 20 problems are listed, with their location (for example
`violations[3].file: must be a repository-relative path with forward slashes`).

Migration: when a new DepTrace version changes `schemaVersion` or `fingerprintVersion`, run
`deptrace baseline update` with the new version, review the diff and commit it. The tool version in
the file is informational and never rejected on its own.

## Limitations

- Changing a rule invalidates the whole baseline, even when the change could not affect accepted
  violations (for example adding a package to `forbidden-packages`). Run `baseline update`.
- Changes outside `deptrace.yml` that affect resolution (tsconfig `paths`, installed packages) are
  not tracked; they can make violations appear as new or resolved.
- A renamed file or rule produces a new and a resolved entry rather than a "moved" one.
- Baseline entries record `message` at creation time; it is not updated until `baseline update`.
