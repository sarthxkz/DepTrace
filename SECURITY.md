# Security policy and vulnerability disclosure

> **Draft. Legal review required before publication.** Sections marked
> `[[PLACEHOLDER: …]]` need a decision by the project owner; they are listed in
> [docs/trust/README.md](docs/trust/README.md#open-placeholders). Nothing in this file is a
> contractual commitment until reviewed.

DepTrace is a command-line tool and a local browser dashboard for analyzing the architecture of
TypeScript and JavaScript repositories. There is no hosted DepTrace service. How DepTrace protects
your code is described in the [Security & Trust Center](docs/trust/README.md).

## Reporting a vulnerability

**Please do not report security vulnerabilities in public GitHub issues, discussions or pull
requests.**

Report privately through one of these channels:

1. **GitHub private vulnerability reporting** for
   [github.com/sarthxkz/DepTrace](https://github.com/sarthxkz/DepTrace): on the repository's
   **Security** tab, choose **Report a vulnerability**.
   _Status on 2026-10-27: this feature is **not enabled** for the repository. Until the owner
   enables it (see [configuration steps](docs/trust/README.md#configuration-steps-for-the-owner)),
   the button does not appear; use the second channel._
2. **Private contact:** `[[PLACEHOLDER: private security contact, e.g. a monitored email address]]`

Please include, as far as you can:

- the DepTrace version (`deptrace --version`) or commit, Node.js version and operating system;
- the affected component (CLI command, `deptrace dashboard` server, dashboard web app, provided
  GitHub Actions workflow);
- steps to reproduce, ideally with a minimal repository or report file;
- the impact you observed or expect.

Do not include real secrets or other people's data in a report. If a proof of concept needs a
repository, use a synthetic one.

## What happens next

`[[PLACEHOLDER: response targets, e.g. time to acknowledge, time to an initial assessment, and how
reporters are kept informed]]`

The project does not currently commit to response times; none should be assumed until the
placeholder above is filled.

`[[PLACEHOLDER: disclosure process, e.g. coordinated disclosure timeline, GitHub Security Advisory
and CVE requests, credit for reporters]]`

## Scope

In scope:

- the `deptrace` CLI (`src/`), including reading untrusted repositories, configuration files,
  baselines and report files;
- the `deptrace dashboard` local server (`src/dashboard/`) and the dashboard web app
  (`dashboard/`), including handling of imported reports;
- the GitHub Actions workflows in `.github/workflows/` and the example workflows in
  `docs/examples/github-actions/`.

Examples of issues we want to hear about: code execution or file access outside the analyzed
repository caused by repository content, reports or HTTP requests; the local server being reachable
or controllable from other origins or machines; injection into terminals, CI logs, workflow
commands or job summaries; secrets or absolute paths leaking into reports; script injection in the
dashboard; resource exhaustion that bypasses the documented limits.

Out of scope:

- vulnerabilities in third-party dependencies that do not affect DepTrace (please report them
  upstream; tell us if DepTrace is affected);
- findings that require an attacker who already controls your user account or machine (for example
  another local program reading `http://127.0.0.1:<port>/api/report` while the dashboard runs; this
  is a documented limitation);
- the security of GitHub, npm or other platforms themselves;
- social engineering and physical attacks.

## Supported versions

DepTrace has **no published releases yet** (the npm package is not published). Fixes are made on the
default branch, `master`.

`[[PLACEHOLDER: supported-versions policy once releases exist, e.g. which release lines receive
security fixes]]`

## Safe harbor

`[[PLACEHOLDER: safe-harbor statement for good-faith security research; requires legal review]]`

## Security features

The Trust Center lists the protections DepTrace actually implements, the threat model and the data
inventory: [docs/trust/README.md](docs/trust/README.md).
