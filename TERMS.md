# Terms of use

> **Draft. Legal review required before publication.** DepTrace is software you run yourself; its
> use is normally governed by its **license**, and the repository has **no license yet**. This draft
> only collects the facts and decisions the owner and a lawyer need. Every
> `[[PLACEHOLDER: …]]` is listed in [docs/trust/README.md](docs/trust/README.md#open-placeholders).

## License

`[[PLACEHOLDER: choose and add a LICENSE file (and the "license" field in package.json); until
then, no license is granted beyond what applicable law allows]]`

## What DepTrace is

DepTrace is a command-line tool and a local browser dashboard that statically analyzes TypeScript
and JavaScript repositories and checks them against architecture rules you configure. There is no
hosted service and no account. Facts relevant to these terms:

- DepTrace reports **static imports only**. It does not run your code and cannot see dependencies
  created at runtime, so a passing check does not prove that an architecture is correct or secure.
- Results depend on your configuration (`deptrace.yml`, baselines) and on what the analysis can
  resolve; unresolved imports are reported, not checked.
- DepTrace is not a security scanner and does not detect vulnerabilities in your code.

## Warranty and liability

`[[PLACEHOLDER: warranty disclaimer and limitation of liability, normally part of the chosen
license; requires legal review]]`

## Acceptable use

`[[PLACEHOLDER: acceptable-use rules, if any beyond the license; requires legal review]]`

## Third-party services

Using DepTrace with GitHub Actions or installing it from npm (once published) is subject to those
platforms' own terms.

## Governing law and changes

`[[PLACEHOLDER: governing law, contact for legal notices, how changes are announced and the
effective date; requires legal review]]`
