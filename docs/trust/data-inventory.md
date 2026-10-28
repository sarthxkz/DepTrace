# Data inventory

Everything DepTrace reads, produces or stores, from the code in this repository (version 0.5.0,
2026-10-27). "You" is whoever runs DepTrace; the DepTrace project receives none of this data.

## Not collected

DepTrace has **no telemetry, analytics, crash reporting, update checks, accounts or cookies**. The
only network request is the dependency audit, and only when the user runs it (`deptrace audit`, or
Check dependencies in the dashboard, which asks the local server to run it): package names and
versions from `package-lock.json`, for packages installed from registry.npmjs.org, sent to the npm
registry's advisory endpoint (`src/audit/audit.ts`; `tests/unit/audit.test.ts` checks exactly what is
sent). Everything else in the CLI is offline, and the dashboard page requests only its own local
server (enforced by its Content Security Policy and checked by `dashboard/e2e/dashboard.spec.ts`).

## Inventory

| #   | Data                                                                                               | Read from / produced by                              | Goes to                                                                                                     | Kept                                                         | How to delete                                                                             |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | Source files (`.ts`, `.tsx`, `.js`, …)                                                             | Your repository, every analysis                      | Process memory only (parsed, never executed)                                                                | Until the file is processed; the process exits after the run | Nothing to delete                                                                         |
| 2   | `deptrace.yml`, `tsconfig*.json` (including `extends` targets), `package.json` name and version    | Your repository                                      | Memory; the package name, version and settings appear in reports                                            | As item 1                                                    | Nothing to delete                                                                         |
| 3   | Git branch name and commit id                                                                      | `.git/HEAD`, refs (dashboard only; `git` is not run) | Dashboard header                                                                                            | Dashboard server memory until it stops                       | Stop the server (Ctrl+C)                                                                  |
| 4   | Analysis results: paths, import specifiers and locations, rule messages, fingerprints, diagnostics | DepTrace                                             | Terminal / CI log (text), or files you name: `--report`, `--sarif`, `--summary`, redirected `--format json` | Until you delete them                                        | Delete the files; CI logs: see items 9–10                                                 |
| 5   | Baselines (`deptrace-baseline.json` or `--file`)                                                   | `deptrace baseline create` / `update`                | The path you choose; usually committed to Git by you                                                        | Until you delete it (Git keeps history)                      | Delete the file; removing it from Git history needs history rewriting                     |
| 6   | The dashboard's current analysis                                                                   | `deptrace dashboard`                                 | Local server memory; your browser via `127.0.0.1`                                                           | Until the server stops                                       | Stop the server                                                                           |
| 7   | Imported report files (JSON, SARIF)                                                                | Files you pick in the dashboard                      | That browser tab's memory; never uploaded                                                                   | Until the tab is reloaded or closed                          | Reload or close the tab                                                                   |
| 8   | Theme preference (`deptrace.theme` = `light` or `dark`)                                            | The dashboard, only when you choose Light or Dark    | Browser `localStorage` for the dashboard's origin (`127.0.0.1:<port>`)                                      | Until deleted                                                | **Privacy & security → Delete stored preference**, choosing System, or clearing site data |
| 9   | `deptrace-report` artifact (the JSON check report)                                                 | The provided GitHub Actions workflows                | GitHub (your repository's Actions artifacts)                                                                | `retention-days: 14`, set in the workflows                   | Delete the artifact in GitHub; lower `retention-days`                                     |
| 10  | Job summary, annotations and log output                                                            | The provided workflows                               | GitHub (the workflow run)                                                                                   | Your repository's Actions log retention setting (GitHub)     | Delete the workflow run in GitHub                                                         |
| 11  | SARIF results                                                                                      | `architecture-code-scanning.yml` (optional)          | GitHub code scanning                                                                                        | Governed by GitHub code scanning                             | Dismiss or delete the analysis in GitHub                                                  |
| 12  | Playwright traces and screenshots (development only)                                               | `npm run test:e2e`                                   | `test-results/` in your checkout (git-ignored)                                                              | Until deleted                                                | Delete `test-results/`                                                                    |

## Sensitive data protection

- **Absolute paths** (checkout location, user name) are removed from diagnostic messages before
  reports are produced: paths under the analysis root become repository-relative and the home
  directory becomes `~` (`redactPaths`, `src/analysis/paths.ts`).
- **Reports contain code-derived data.** Paths, import specifiers and messages can reveal internal
  names. DepTrace does not read or report file contents beyond imports, and it does not detect or
  remove secrets that appear in file names or import strings. Treat reports and CI artifacts like
  source code: for private repositories, keep artifacts private and use short retention.
- **No credentials are needed or stored** by DepTrace. The workflows use the default `GITHUB_TOKEN`
  with read-only permissions (plus `security-events: write` for the SARIF upload) and do not
  persist it in the checkout.
- **Messages from untrusted text** are escaped for terminals, workflow logs, job summaries and the
  dashboard, so file names cannot inject commands or disguise themselves (see the
  [threat model](threat-model.md)).
