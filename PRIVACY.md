# Privacy policy

> **Draft. Legal review required before publication.** This draft describes how the DepTrace
> software handles data, as implemented in this repository on 2026-10-27 (version 0.5.0). Legal
> elements (the responsible party, legal bases, rights and jurisdiction) are left as
> `[[PLACEHOLDER: …]]` for the owner and a lawyer. They are listed in
> [docs/trust/README.md](docs/trust/README.md#open-placeholders).

## Who is responsible

`[[PLACEHOLDER: name and contact details of the party responsible for this policy]]`

## Summary

- DepTrace is software you run yourself: a command-line tool and a dashboard served from your own
  computer. There is **no hosted service, no account and no sign-in**.
- The software **sends no data to the DepTrace project or anyone else**: no telemetry, analytics,
  crash reports or update checks. The one network request is the dependency audit (`deptrace
audit`, or Check dependencies in the dashboard), made only when you run it: it sends the names and
  versions of the packages in `package-lock.json` that were installed from registry.npmjs.org to
  the npm registry, to look up known advisories. It sends no source code and nothing for packages
  from private registries, git or local paths. npm's own privacy terms apply to that request.
- DepTrace reads your source code on your machine and writes results only where you tell it to.

The complete list of what is read, where it goes and how long it stays is the
[data inventory](docs/trust/data-inventory.md).

## Data the software processes on your computer

| Data                                                           | What happens                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Source files, `deptrace.yml`, `tsconfig*.json`, `package.json` | Read into memory for the analysis; never executed; discarded when the run ends |
| Git `HEAD` and refs (dashboard only)                           | Branch name and commit id read from `.git` files to show in the dashboard      |
| Results (reports, SARIF, baselines, job summaries)             | Printed or written only to the paths you choose                                |
| The dashboard's analysis                                       | Kept in the memory of the local server until you stop it                       |
| The dashboard's theme preference                               | Stored in your browser (`deptrace.theme`) only if you choose Light or Dark     |

Reports contain repository paths, import specifiers, rule messages and violation fingerprints
derived from your code. Absolute paths and your home directory are removed from them, but treat
report files like source code.

## Data processed by platforms you choose to use

- **GitHub Actions.** If you use DepTrace's workflows, GitHub stores the job logs, job summary, the
  `deptrace-report` artifact (the provided workflows set `retention-days: 14`) and, with the code
  scanning workflow, the SARIF results. This happens in your GitHub account under GitHub's terms
  and privacy statement; the DepTrace project does not receive this data.
- **npm.** If you install DepTrace from npm, the npm registry processes your download under npm's
  own terms and privacy policy. The DepTrace project sees only the aggregate download counts npm shows
  publicly for every package.

## Data the project receives when you contact it

If you open an issue or pull request, or report a vulnerability, the information you provide is
processed by GitHub and visible to the project's maintainers (and, for public issues, to everyone).

`[[PLACEHOLDER: how long the project keeps vulnerability reports and correspondence, and who can
access them]]`

## Your choices and rights

- You control all data the software produces: delete report files, baselines and CI artifacts to
  remove them. In the dashboard, **Privacy & security → Delete stored preference** removes the only
  value it stores in your browser.
- `[[PLACEHOLDER: data-protection rights, legal bases and how to exercise them, if applicable;
requires legal review]]`

## Children

`[[PLACEHOLDER: statement on children's data, if required; requires legal review]]`

## Changes

`[[PLACEHOLDER: how changes to this policy are announced, and the effective date]]`
