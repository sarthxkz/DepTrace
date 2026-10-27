# Security & Trust Center

This page states how DepTrace handles your code and what protects it, with a pointer to the code
and the tests for each claim. It covers DepTrace 0.5.0 as implemented in this repository on
2026-10-27. **No compliance certifications are claimed.**

| Document                               | Purpose                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| [SECURITY.md](../../SECURITY.md)       | Vulnerability disclosure policy: how to report, scope          |
| [PRIVACY.md](../../PRIVACY.md)         | Privacy policy (draft, legal review required)                  |
| [TERMS.md](../../TERMS.md)             | Terms of use (draft, legal review required; no license yet)    |
| [data-inventory.md](data-inventory.md) | Every piece of data: source, destination, retention, deletion  |
| [threat-model.md](threat-model.md)     | Assets, trust boundaries, threats, mitigations, residual risks |

## Deployment model

DepTrace runs entirely on infrastructure you control:

- **CLI** (`deptrace`): reads a repository from disk and prints or writes results. It makes no
  network requests.
- **Dashboard** (`deptrace dashboard`): the same analysis, served to your browser by a small HTTP
  server bound to `127.0.0.1`. The browser app talks only to that server.
- **GitHub Actions workflows**: run the CLI inside your CI, with read-only permissions (plus
  `security-events: write` for the optional SARIF upload workflow).

There is no DepTrace cloud service, account, database or administrator, and none is needed.

## Security features

Every item is implemented and tested; nothing here is planned work.

**Analysis of untrusted repositories**

- Repository code is parsed with the TypeScript compiler and never executed
  (`src/analysis/parser.ts`).
- Discovery stays inside the analysis root and skips symbolic links (`src/analysis/discovery.ts`).
- Configured globs must be repository-relative: no leading `/`, drive letter or `..`
  (`src/rules/patterns.ts`, `tests/unit/config.test.ts`).
- `deptrace.yml` is validated before use; invalid values are reported with control characters
  escaped (`src/config/`, `src/core/errors.ts`).
- Absolute paths and the home directory are removed from diagnostic messages before they reach any
  report (`redactPaths` in `src/analysis/paths.ts`, `tests/unit/redaction.test.ts`).
- Reports, baselines and SARIF contain repository-relative paths only.

**Output to terminals, CI logs and GitHub**

- All CLI text output escapes control characters (ANSI escape sequences) and Unicode bidirectional
  overrides that repository file names could contain (`terminalSafe`, `src/utils/logger.ts`,
  `tests/unit/redaction.test.ts`).
- `--format github` disables workflow commands around repository text, escapes annotation data
  and bounds the number of annotations; job summaries escape Markdown and are size-limited
  (`src/cli/github.ts`, `tests/unit/github.test.ts`, `tests/integration/baseline-cli.test.ts`).

**Baselines and report files**

- Baselines are size-limited (64 MB), schema-validated, reject absolute or `..` paths and
  duplicates, are written atomically and never overwritten by `baseline create`
  (`src/baseline/`, [baseline.md](../baseline.md), `tests/unit/baseline.test.ts`).
- The dashboard rejects report files over 64 MB, invalid JSON, unsupported schema versions, wrong
  types and broken references, listing at most 20 problems (`dashboard/src/contract/`,
  `dashboard/tests/contract.test.ts`).

**Local dashboard server** (`src/dashboard/server.ts`, `tests/integration/dashboard-cli.test.ts`)

- Binds to `127.0.0.1` only and answers only requests whose `Host` is `127.0.0.1:<port>` or
  `localhost:<port>` (protects against DNS rebinding).
- No URL maps to the filesystem: the app's files are loaded into memory at startup. The API takes
  no paths or parameters, so the browser cannot choose what is read or analyzed.
- Re-analysis needs the server's own `Origin`, a custom header that forces a CORS preflight the
  server never approves, and an empty body; only one analysis runs at a time.
- Responses carry a strict Content Security Policy (`default-src 'none'`), `nosniff`,
  `no-referrer`, `X-Frame-Options: DENY` and `no-store`; no cookies are set.
- Git branch and commit are read from `.git` files without running `git` (`src/dashboard/git.ts`,
  `tests/unit/git-head.test.ts`).

**Dashboard web app**

- Renders repository text as text (no HTML injection sinks) and shows invisible control and
  bidirectional characters as visible escapes (`revealControls`, `dashboard/src/lib/format.ts`).
- Makes no requests except to the local server; verified in Chrome by
  `dashboard/e2e/dashboard.spec.ts`.
- Stores one browser preference at most, deletable on the **Privacy & security** page.

**Build and CI** (`.github/`, `tests/integration/workflows.test.ts`)

- Third-party actions are pinned to commit SHAs, permissions are least-privilege, checkout does not
  persist credentials, `pull_request_target` is not used and `run:` steps never interpolate
  `${{ }}` expressions.
- `npm ci --ignore-scripts` (dependency install scripts never run in CI); `npm audit` checks the
  runtime dependencies for known high-severity advisories.
- Dependabot configuration for npm and GitHub Actions updates (`.github/dependabot.yml`).
- Source hygiene: a test fails if any source, test, workflow or documentation file contains
  bidirectional-override or other invisible control characters (`tests/unit/source-hygiene.test.ts`).
- The policy documents are checked too: placeholders must be listed below, and the drafts may not
  contain contact addresses or compliance claims (`tests/unit/trust-docs.test.ts`).

## Configuration steps for the owner

These cannot be done from the code and are not done yet:

1. **Enable GitHub private vulnerability reporting** (repository **Settings → Code security →
   Private vulnerability reporting**). On 2026-10-27 the GitHub API reported it as disabled for
   `sarthxkz/DepTrace`. Then update the status note in [SECURITY.md](../../SECURITY.md).
2. **Choose a license** and add `LICENSE` plus the `license` field in `package.json`.
3. **Fill every placeholder below** and have [PRIVACY.md](../../PRIVACY.md),
   [TERMS.md](../../TERMS.md) and the safe-harbor section of [SECURITY.md](../../SECURITY.md)
   reviewed by a lawyer. Then remove the "Draft" notices.
4. **Enable Dependabot alerts and security updates** (Settings → Code security) so
   `.github/dependabot.yml` takes effect for alerts as well as version updates.
5. **Protect the default branch** and add a `CODEOWNERS` entry for `deptrace-baseline.json` and
   `.github/workflows/` so changes to accepted violations and CI need review
   ([baseline.md](../baseline.md#approving-and-updating-a-baseline)).

## Open placeholders

Every `[[PLACEHOLDER: …]]` in these documents must appear in this list (a test enforces it):

- [ ] `private security contact` (SECURITY.md)
- [ ] `response targets` (SECURITY.md)
- [ ] `disclosure process` (SECURITY.md)
- [ ] `supported-versions policy` (SECURITY.md)
- [ ] `safe-harbor statement` (SECURITY.md)
- [ ] `name and contact details of the party responsible` (PRIVACY.md)
- [ ] `npm's processing of download data` (PRIVACY.md)
- [ ] `how long the project keeps vulnerability reports` (PRIVACY.md)
- [ ] `data-protection rights` (PRIVACY.md)
- [ ] `statement on children's data` (PRIVACY.md)
- [ ] `how changes to this policy are announced` (PRIVACY.md)
- [ ] `choose and add a LICENSE file` (TERMS.md)
- [ ] `warranty disclaimer and limitation of liability` (TERMS.md)
- [ ] `acceptable-use rules` (TERMS.md)
- [ ] `governing law` (TERMS.md)
- [ ] `review owner and cadence` (docs/trust/threat-model.md)
