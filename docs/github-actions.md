# GitHub Actions

DepTrace runs in GitHub Actions as an ordinary CLI: no GitHub credentials, no API calls, no
special action. The CLI writes everything GitHub needs (a job summary, annotations, a JSON report,
optionally SARIF), and the workflow decides what to do with the exit code.

> **Status.** DepTrace is published to npm as `deptrace-cli`, but there is no published GitHub
> Action or Marketplace listing. The workflows below build DepTrace from a pinned commit of its Git
> repository. They are validated locally (schema, security checks, and their shell steps run
> against the real CLI in tests), but they have **not yet run on GitHub**.

## Files

| File                                                                                                            | Purpose                                                                |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`docs/examples/github-actions/deptrace.yml`](examples/github-actions/deptrace.yml)                             | Copyable check for your repository: pull requests, pushes, manual runs |
| [`docs/examples/github-actions/deptrace-code-scanning.yml`](examples/github-actions/deptrace-code-scanning.yml) | Optional, copyable SARIF upload to GitHub code scanning                |
| [`.github/workflows/architecture.yml`](../.github/workflows/architecture.yml)                                   | DepTrace checking its own architecture (builds from its own checkout)  |
| [`.github/workflows/architecture-code-scanning.yml`](../.github/workflows/architecture-code-scanning.yml)       | DepTrace's own SARIF upload                                            |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)                                                       | DepTrace's own tests, lint and smoke tests on Linux, Windows and macOS |

## Setup

1. Add a `deptrace.yml` with rules to your repository (`deptrace init`, then
   [rules.md](rules.md)), and make sure `deptrace check` works locally.
2. Copy [`docs/examples/github-actions/deptrace.yml`](examples/github-actions/deptrace.yml) to
   `.github/workflows/deptrace.yml`.
3. Set the two required values in its `env` section:
   - `DEPTRACE_REPOSITORY`: the GitHub repository that hosts DepTrace (`owner/name`).
   - `DEPTRACE_REF`: the full 40-character commit SHA of the DepTrace version to use. Branch and
     tag names are rejected, so the tool cannot change under you.
4. Optional settings in the same section: `NODE_VERSION` (default `24`; DepTrace needs 22.12+),
   `DEPTRACE_DIRECTORY` (where `deptrace.yml` is, default `.`), `DEPTRACE_BASELINE` and
   `DEPTRACE_STRICT`.
5. To make the check required, add the job ("Architecture check") as a required status check in
   the branch protection rules or rulesets of your default branch.

If `DEPTRACE_REPOSITORY` is private, the default `GITHUB_TOKEN` cannot read it; host DepTrace in a
repository the workflow can read rather than adding a personal access token.

What the workflow does:

1. Validates `DEPTRACE_REF`.
2. Checks out your repository (read-only token, credentials not persisted, two commits of history)
   and DepTrace, then builds DepTrace in `$RUNNER_TEMP` with `npm ci --ignore-scripts` (no
   install scripts) and `npm run build`. Your repository's code is only read, never executed.
3. In pull requests with a baseline: flags changes to the baseline file.
4. Runs `deptrace check --format github --report ... --summary "$GITHUB_STEP_SUMMARY"`.
5. Uploads the JSON report as the artifact `deptrace-report` (kept 14 days), also when the check
   fails.

## Modes

**Full check (default, `DEPTRACE_BASELINE: ''`).** Every error violation fails the job. Use this
when your repository has no violations, or after you fixed the accepted ones.

**Baseline-aware (`DEPTRACE_BASELINE: deptrace-baseline.json`).** Only violations that are not in
the committed baseline fail the job; existing ones are still reported. Create the baseline first
(see [baseline.md](baseline.md)):

```sh
deptrace baseline create
git add deptrace-baseline.json && git commit -m "Accept existing architecture violations"
```

`DEPTRACE_STRICT: 'true'` adds `--strict` in both modes: warnings fail too (in baseline mode, new
warnings).

## Results and exit codes

| Exit code | Meaning                                                                     | Job    | Summary                       |
| --------- | --------------------------------------------------------------------------- | ------ | ----------------------------- |
| `0`       | No failing (new) violations                                                 | passes | "passed", with all counts     |
| `3`       | Failing (new) violations                                                    | fails  | "failed", with the violations |
| `2`       | Invalid `deptrace.yml`, no rules, missing, invalid or incompatible baseline | fails  | "error (exit code 2)"         |
| `1`       | Operational error (unreadable files, I/O)                                   | fails  | "error (exit code 1)"         |

No error is turned into success: the step exits with DepTrace's exit code.

**Job summary** (Markdown, appended to `$GITHUB_STEP_SUMMARY`): result and mode; a table of all,
new, existing and resolved violations by severity; violations per rule; up to 30 (new) violations
with location, rule and message; the 10 most affected files; resolved baseline entries (up to 30);
next steps; analysis status. Longer lists say "Showing 30 of N" and point to the JSON report.
Messages are truncated to 300 characters. All text from the repository (file names, messages) is
escaped, so it cannot inject Markdown, links or HTML.

**Annotations.** `--format github` prints the normal text report, then one annotation per (new)
violation at its source location: `error` or `warning`, with the rule id as title. GitHub shows at
most 10 annotations of each severity per step, so DepTrace emits at most 10 of each and a notice
with the number left out. Paths are relative to the Git repository root, also when
`DEPTRACE_DIRECTORY` is a subdirectory. In baseline mode only new violations are annotated.

**JSON report.** `--report <file>` writes the same document as `check --format json` (see
[rules.md](rules.md#deptrace-check-directory)), complete and unbounded, plus a `baseline` section
in baseline mode.

## SARIF and code scanning (optional)

`deptrace check --sarif <file>` writes a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
log. Tests validate it against the official OASIS JSON schema. It contains:

- one `rule` per enabled DepTrace rule (`id` = rule id, `defaultConfiguration.level` = severity);
- one `result` per violation with `level` `error` or `warning`, the message, the location
  (repository-relative URI, start line and column in UTF-16 code units), the imported file as a
  related location, and `partialFingerprints: { "deptrace/v1": <fingerprint> }`;
- with `--baseline`: `baselineState` `new` or `unchanged` on each result.

It is deterministic (no timestamps, no absolute paths), and it is written whether or not
violations fail the check (exit `0` or `3`).

To upload it, copy
[`docs/examples/github-actions/deptrace-code-scanning.yml`](examples/github-actions/deptrace-code-scanning.yml)
and set `DEPTRACE_REPOSITORY` and `DEPTRACE_REF`. It:

- runs only on pushes to `main` and manual runs, **never for pull requests**, because uploading
  needs `security-events: write`;
- grants `security-events: write` (and `actions: read`, needed in private repositories) to that one
  job only; the workflow default is no permissions;
- treats exit code `3` as expected (violations are what code scanning shows) and fails on any other
  error;
- uploads with `github/codeql-action/upload-sarif` under the category `deptrace`.

Code scanning must be available for the repository (public repositories, or GitHub Advanced
Security for private ones). GitHub limits uploads (for example to 25 000 results per run); DepTrace
does not cap SARIF output.

## Security

### Threat model and trust boundaries

| Input                                                   | Trust         | Why / handling                                                      |
| ------------------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| Workflow file, `env` settings                           | Trusted       | Written by maintainers; changes to `.github/` should require review |
| DepTrace source at `DEPTRACE_REF`                       | Trusted       | Pinned to a commit SHA you chose; built without install scripts     |
| Pull request code, file names, `deptrace.yml`, baseline | **Untrusted** | May come from a fork; only read and parsed, never executed          |
| Branch names, PR titles and other event data            | **Untrusted** | Not used by the workflows at all                                    |

Consequences of that model in the workflows:

- **Triggers.** `pull_request` (not `pull_request_target`, not `workflow_run`): pull requests from
  forks run with a read-only `GITHUB_TOKEN` and without secrets. The workflows need no secrets.
- **Permissions.** `contents: read` for the check. Write access (`security-events`) exists only in
  the separate SARIF workflow, for one job, never triggered by pull requests.
- **Pinned actions.** Every third-party action is pinned to a full commit SHA (versions below).
- **No shell interpolation.** `run:` scripts never contain `${{ ... }}` expressions; values reach
  the shell as environment variables and are quoted, and arguments are passed as an array. A test
  enforces this, and another runs the steps with a baseline path like `$(touch pwned)` to show it
  stays data.
- **Credentials.** Checkouts use `persist-credentials: false`, so the token is not left in
  `.git/config` for later steps.
- **No code execution from the PR.** DepTrace parses files with the TypeScript compiler; it never
  imports or runs them. The workflow does not run your package scripts (the optional dependency
  install uses `--ignore-scripts`).
- **Workflow command injection.** A repository can contain file names or import specifiers such
  as `::error::...` or with embedded newlines. `--format github` wraps the text report in
  `::stop-commands::<random token>`, so nothing in it is interpreted as a workflow command, and it
  escapes annotation data and properties as `@actions/core` does (`%`, CR, LF, `:`, `,`).
  Configuration and baseline error messages escape control characters.
- **Path handling.** Patterns in `deptrace.yml` and paths in baselines must be relative, without
  `..`, drive letters or backslashes; discovery never follows symlinks; reports contain only
  repository-relative paths.
- **Output size.** Summary and annotations are bounded; the baseline reader refuses files over
  64 MB; full detail goes to the artifact.
- **Artifacts.** A fixed name (`deptrace-report`), only DepTrace's JSON report (file paths,
  import specifiers and messages, no source contents), 14-day retention. Nothing is downloaded
  or extracted.
- **Baseline integrity.** A pull request can edit the baseline to accept its own violations. The
  workflow flags such changes in the summary and as a warning; protect the file with `CODEOWNERS`
  and required reviews (see [baseline.md](baseline.md#approving-and-updating-a-baseline)). Nothing
  updates the baseline automatically.

### Caching

`actions/setup-node` caches the npm download cache for DepTrace's own lockfile. Analysis results
are never cached; every run analyzes the checked-out code from scratch, so caching cannot cause
stale results. The cache holds only public npm packages.

## Pinned action versions

Verified with `git ls-remote` against the action repositories on 2026-10-27:

| Action                              | Version | Commit SHA                                 |
| ----------------------------------- | ------- | ------------------------------------------ |
| `actions/checkout`                  | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node`                | v7.1.0  | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-artifact`           | v7.0.2  | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `github/codeql-action/upload-sarif` | v4.39.1 | `9b3254085494b55a0f7c4c2b3d2d52cc712ce370` |

To update one, resolve the new tag to its commit (for annotated tags use the `^{}` line):

```sh
git ls-remote https://github.com/actions/checkout.git 'refs/tags/v7.0.1' 'refs/tags/v7.0.1^{}'
```

## Changed files and incremental analysis

DepTrace always analyzes the whole repository, also in pull requests. It does not filter findings
to the changed files: an architecture violation can involve files the pull request did not touch
(for example a new file that imports an old one, or a cycle closed elsewhere), so filtering would
report a broken architecture as valid. A full analysis needs no Git history either, so shallow
clones work. The only history the example workflow uses is the parent commit of a pull request's
merge commit, to detect baseline changes; without it, it prints a notice and continues.

## Troubleshooting

- **"Set DEPTRACE_REF to the full commit SHA"**: replace the placeholder with a 40-character SHA
  (`git rev-parse HEAD` in the DepTrace checkout you want).
- **Exit code 2, "Baseline file not found"**: create and commit it (`deptrace baseline create`),
  or clear `DEPTRACE_BASELINE` for a full check. The path is relative to the repository root.
- **Exit code 2, "does not match the current configuration"**: `deptrace.yml` changed after the
  baseline was approved. Run `deptrace baseline update`, review and commit.
- **Exit code 2, "No architecture rules are configured"**: the check refuses to pass with nothing
  to check; add rules.
- **Annotations missing**: GitHub shows at most 10 per severity per step; the rest are in the
  summary and the report. In baseline mode only new violations are annotated.
- **Annotations on the wrong file**: paths are relative to the Git repository root. If you check
  out your repository into a subdirectory (`path:` of `actions/checkout`), keep `DEPTRACE_DIRECTORY`
  relative to the workspace and expect paths relative to the repository.
- **Unresolved imports**: the summary says "completed with diagnostics". If resolution needs your
  dependencies (for example a tsconfig that extends a package), enable the optional
  `npm ci --ignore-scripts` step.
- **SARIF upload fails**: check that code scanning is enabled and the job has
  `security-events: write`. Uploads from pull requests of forks are not possible by design.

## Limitations

- The workflows have not run on GitHub yet; they were validated locally against SchemaStore's
  workflow schema and with security tests, and their shell steps were run against the real CLI.
  `actionlint` was not run.
- There is no reusable or Marketplace action; each repository copies the workflow and pins
  DepTrace by commit.
- No pull request comments (summaries and annotations need no write permission; comments would).
- The baseline-change warning compares with the merge commit's first parent, so it needs the
  `pull_request` event and `fetch-depth: 2`.
