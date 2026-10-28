# Security operations

DepTrace has **no hosted backend**: no server the project operates, no database, no accounts, no
tenants, no outbound integrations. Checked on 2026-10-28: the runtime dependencies are `commander`,
`picomatch`, `typescript` and `yaml`, and the only server is the user's own `deptrace dashboard`
on `127.0.0.1`. There is therefore **no security admin panel**. Building one would add a remote
attack surface that protects nothing.

The project's real operations happen on GitHub (and on npm once the package is published). This page
maps every admin capability to where it actually lives, and gives the runbooks.

## Requested admin capabilities

| Capability                                     | Status                         | Where it lives today                                                                                                              |
| ---------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Security overview with real metrics            | Platform                       | GitHub **Security** tab (advisories, Dependabot alerts, code scanning); CI results. No uptime: nothing is hosted.                 |
| Vulnerability management, remediation          | Platform                       | GitHub Security Advisories (draft advisory, temporary private fork, CVE request); Dependabot alerts                               |
| Security report triage                         | Platform + runbook             | Private vulnerability reports (once enabled, see [SECURITY.md](../../SECURITY.md)); [runbook 1](#1-triage-a-vulnerability-report) |
| Threat and incident management                 | Runbook                        | [threat-model.md](threat-model.md); [runbook 3](#3-incident-compromised-account-token-or-release)                                 |
| System health and monitoring                   | Not applicable                 | No hosted system. CI status on `master` is the health signal; no uptime or traffic metrics exist or are reported.                 |
| Audit logs                                     | Platform                       | GitHub repository and account security logs; npm account activity. DepTrace itself stores nothing to audit.                       |
| Admin RBAC, MFA, sessions, access reviews      | Platform + runbook             | GitHub repository roles, npm package maintainers, 2FA on both; [runbook 5](#5-access-review)                                      |
| Alerts and notifications                       | Platform                       | GitHub notifications for advisories, Dependabot and failed workflows (each maintainer's notification settings)                    |
| Privacy requests, exports, retention, deletion | Not applicable to the software | The software holds no personal data ([data-inventory.md](data-inventory.md)). Correspondence: see [PRIVACY.md](../../PRIVACY.md). |
| Security settings and runbooks                 | This page                      | [Configuration steps](README.md#configuration-steps-for-the-owner) and the runbooks below                                         |

Server-side authorization, rate limiting, tenant isolation and SSRF protection have no surface to
apply to. The one local API (`deptrace dashboard`) is protected as described in the
[Trust Center](README.md#security-features).

## Architecture violations are not security vulnerabilities

- An **architecture violation** is a finding from a rule in a user's `deptrace.yml` (for example a
  forbidden layer import) about **the user's own code**. It belongs in their CI, baseline and
  dashboard, never in DepTrace's security process.
- A **security vulnerability** is a flaw in **DepTrace itself** that lets repository content,
  report files or other origins cause harm (see [SECURITY.md](../../SECURITY.md#scope)). Report it
  privately.

DepTrace is not a security scanner: a clean `deptrace check` says nothing about vulnerabilities in
the analyzed code.

## Runbooks

### 1. Triage a vulnerability report

1. Acknowledge privately in the advisory (or the private channel). Do not discuss it in public
   issues or commits.
2. Reproduce with a **synthetic** repository or report file. Never ask for the reporter's real code.
3. Decide: is it a DepTrace vulnerability (in scope per [SECURITY.md](../../SECURITY.md#scope)), an
   architecture finding in someone's code (not a vulnerability), or a platform or dependency issue
   (report upstream)?
4. For a real vulnerability:
   - Fix it in the advisory's temporary private fork.
   - Add a regression test next to the existing security tests (`tests/unit/redaction.test.ts`,
     `tests/integration/dashboard-cli.test.ts`, `dashboard/tests/contract.test.ts`).
   - Run the full verification ([development.md](../development.md)).
5. Release the fix ([runbook 4](#4-release-and-rollback)), then publish the advisory crediting the
   reporter if they agree, and request a CVE through GitHub if warranted.
6. Update [threat-model.md](threat-model.md) if the finding exposed a missing threat.

Response targets: none are committed yet (`SECURITY.md`, placeholder "response targets").

### 2. Dependency or action alert

Triggered by a Dependabot alert or PR, a failing `dependencies` CI job (`npm audit --omit=dev`), or
an upstream advisory.

1. Check whether DepTrace uses the affected code path. Runtime dependencies matter most; dashboard
   libraries are bundled into `dist/dashboard`.
2. Update with `npm install <package>@<fixed version>`. Review the lockfile diff and run the full
   verification.
3. For a GitHub Action update, verify the new commit SHA against the release tag with
   `git ls-remote https://github.com/<owner>/<action> refs/tags/<tag>` before replacing the pin,
   and update the table in [github-actions.md](../github-actions.md#pinned-action-versions).
4. Release if the published package is affected.

### 3. Incident: compromised account, token or release

1. **Contain.**
   - Revoke the affected credential: GitHub sessions, personal access tokens, SSH keys, or npm
     tokens (`npm token revoke`).
   - Require 2FA, and review recent pushes, releases, workflow runs and npm versions.
2. **Malicious or broken npm version** (once published):
   - Run `npm deprecate deptrace-cli@<version> "<reason>"` and publish a fixed version.
   - Unpublishing is only possible within npm's unpublish window; version numbers can never be
     reused.
3. **Malicious commit or workflow change.**
   - Revert it, and check that no workflow gained permissions.
   - The workflow rules are enforced by `tests/integration/workflows.test.ts`.
4. **Secret committed by mistake.** Revoke the secret first: removing it from Git history does not
   un-leak it.
5. **Communicate** through a GitHub Security Advisory.
   `[[PLACEHOLDER: incident communication channel and maintainer roster]]`

### 4. Release and rollback

There is no deployment: a release is a version of the npm package (not published yet) and a Git tag.

- **Release:**
  1. Run the full verification.
  2. Run `npm version <patch|minor|major>`, then `git push --follow-tags`, then `npm publish`.
- **Rollback:** published versions cannot be replaced.
  - Deprecate the bad version (`npm deprecate`).
  - Publish the previous code as a new patch version (`git revert`, then release).
  - Users pin with `npm install deptrace-cli@<good version>`.
- **Reports and baselines stay compatible across rollbacks** as long as `schemaVersion` and
  `fingerprintVersion` do not change ([baseline.md](../baseline.md#compatibility)). A rollback across
  a fingerprint-version change needs `deptrace baseline update`.

### 5. Access review

`[[PLACEHOLDER: access review cadence]]`

1. List people with write, maintain or admin access on the GitHub repository, and maintainers of
   the npm package. Remove anyone who no longer needs access.
2. Confirm 2FA is enabled for all of them (GitHub and npm).
3. Review branch protection on `master`, required reviews, and `CODEOWNERS` for
   `.github/workflows/` and baselines ([configuration steps](README.md#configuration-steps-for-the-owner)).
4. Review GitHub Actions secrets: the provided workflows need none.

## If a hosted service is ever added

Build the admin capabilities above only together with the service that needs them, and only after:

- authentication with mandatory MFA for privileged roles, server-side authorization on every
  endpoint, short-lived sessions, and an append-only audit log;
- tenant isolation in the data model, and migrations with tested rollback;
- validated, size-limited ingestion of untrusted reports (reuse `dashboard/src/contract/`);
- SSRF protection (allowlisted destinations, no internal address ranges) for any outbound webhook
  or integration, plus rate limiting;
- real monitoring and alerting before any health or uptime figure is shown;
- an updated threat model, data inventory and privacy policy, with legal review.
