# Threat model

Scope: DepTrace 0.5.0 as implemented in this repository on 2026-10-27, which includes the CLI, the
local dashboard server and web app, and the GitHub Actions workflows. Review it whenever a component
gains a new input, output or network surface.
`[[PLACEHOLDER: review owner and cadence]]`

## Assets

1. **Your source code and repository metadata** (names, structure, branch, commits).
2. **Your machine and CI runner**: files outside the analyzed repository, the ability to run code.
3. **Integrity of results**: CI pass or fail, the accepted violations in a baseline, what the
   dashboard shows.
4. **CI credentials**: the workflow `GITHUB_TOKEN`.

## Trust boundaries and data flow

```
 untrusted                         DepTrace (trusted code)                   outputs
 ─────────                         ───────────────────────                   ───────
 repository files ─┐
 deptrace.yml      ├─▶ CLI analysis (parse only) ─▶ text ──────────────▶ terminal / CI log
 tsconfig*.json    │        │                    ─▶ JSON / SARIF ──────▶ files, CI artifacts
 baseline file   ──┘        │                    ─▶ workflow commands ─▶ GitHub annotations
                            ▼
 browser on this machine ◀─ 127.0.0.1 server ◀── report (memory)
   ▲  imported report files (untrusted) validated in the browser
   └─ other web pages / sites (untrusted) must not read or trigger anything

 package-lock.json ─▶ deptrace audit (on request) ─▶ names + versions ─▶ npm registry (HTTPS)
                              ◀─ advisories and published versions (untrusted) ◀─┘
```

- **Repository content is untrusted.** In CI it can come from a pull request by anyone. This covers
  code, configuration, baselines, file names and import specifiers.
- **Report files are untrusted** when imported into the dashboard or served with `--report`.
- **The advisory service is untrusted.** Its answers to `deptrace audit` are validated before use.
- **Other origins are untrusted.** Web pages in the same browser, and other hosts on the network,
  must not be able to reach the dashboard server.
- **The person running DepTrace is trusted.** Command-line arguments, such as output paths and the
  directory to analyze, express their intent.

## Threats and mitigations

| Threat                                                                 | Mitigation (code · test)                                                                                                                                                                                                                                                             | Residual risk                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Repository code runs during analysis                                   | Parse only, never execute · `src/analysis/parser.ts`                                                                                                                                                                                                                                 | None known                                                                                                                       |
| Analysis reads files outside the repository                            | Discovery stays under the root and skips symlinks; globs must be relative · `discovery.ts`, `patterns.ts` · `tests/unit/config.test.ts`                                                                                                                                              | `tsconfig` `extends` may name files outside the root. TypeScript reads them as configuration, but their contents are not echoed. |
| Path traversal through baselines or reports                            | Baseline paths must be relative, without `..` or `\` · `src/baseline/baseline.ts` · `tests/unit/baseline.test.ts`; the dashboard validates every reference · `dashboard/src/contract/`                                                                                               | None known                                                                                                                       |
| Path traversal or file reads through the dashboard server              | No URL is mapped to the filesystem (in-memory assets), the API takes no parameters · `src/dashboard/server.ts` · `tests/integration/dashboard-cli.test.ts`                                                                                                                           | None known                                                                                                                       |
| Another website reads or drives the local server (CSRF, DNS rebinding) | Bound to 127.0.0.1; `Host` allowlist; `Origin` plus custom header plus empty body for POST; no CORS · same test                                                                                                                                                                      | Any **local** program can read `/api/report` while the server runs (documented)                                                  |
| Command injection into the terminal or CI log via file names           | `terminalSafe` on all text output; GitHub workflow commands stopped around repository text; annotation escaping · `tests/unit/redaction.test.ts`, `tests/integration/baseline-cli.test.ts`                                                                                           | Commander's own help and error output is not filtered; it contains only arguments you typed                                      |
| Script injection in the dashboard                                      | React text rendering, no HTML sinks, CSP `script-src 'self'` · `dashboard/tests/app.test.tsx`                                                                                                                                                                                        | None known                                                                                                                       |
| Display spoofing with bidirectional characters ("Trojan Source")       | Escaped in CLI output (including annotations), job summaries and the dashboard; repository source scanned in CI · `tests/unit/source-hygiene.test.ts`                                                                                                                                | None known                                                                                                                       |
| Leaking the checkout path or user name in reports and artifacts        | `redactPaths` on diagnostics; reports are repository-relative · `tests/unit/redaction.test.ts`                                                                                                                                                                                       | Error messages printed to stderr (not reports) can contain absolute paths you passed                                             |
| Oversized or malformed inputs (resource exhaustion)                    | 64 MB limits on baselines and report files; validators cap problem lists; graph rendering limits; CI job timeouts · contract and dashboard tests                                                                                                                                     | A very large repository or `deptrace.yml` can still use CPU and memory until the CI timeout                                      |
| A pull request accepts its own violations through the baseline         | Workflows only read the baseline; the example flags baseline changes; CODEOWNERS recommended · [baseline.md](../baseline.md)                                                                                                                                                         | Needs branch protection and CODEOWNERS (owner configuration)                                                                     |
| CI credential misuse                                                   | Least-privilege permissions, `persist-credentials: false`, no `pull_request_target`, no `${{ }}` in `run:` · `tests/integration/workflows.test.ts`                                                                                                                                   | None known                                                                                                                       |
| Malicious or spoofed advisory responses                                | HTTPS to registry.npmjs.org by default; responses checked against the documented shape, entries for unrequested packages dropped, only `https://` advisory links kept, everything rendered as text; requests time out after 30 s · `src/audit/audit.ts` · `tests/unit/audit.test.ts` | `DEPTRACE_AUDIT_REGISTRY` can point the audit at any server the person running it chooses                                        |
| The audit discloses private package names                              | Only packages whose lockfile `resolved` URL is on registry.npmjs.org are sent; private-registry, git and local packages are counted as not checked · `tests/unit/audit.test.ts`                                                                                                      | npm learns the public package names and versions a project uses when the audit runs                                              |
| Compromised dependency or action                                       | SHA-pinned actions; `npm ci --ignore-scripts`; five runtime dependencies; `npm audit` in CI; Dependabot                                                                                                                                                                              | Advisories are only as current as the npm database; review Dependabot updates before merging                                     |

## Out of scope

Attackers who already control your user account or machine; the security of GitHub and npm; denial
of service on a machine where you chose to analyze an untrusted repository without CI limits.
