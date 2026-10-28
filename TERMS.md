# Terms of use

> **Draft. Legal review required before publication.** DepTrace is software you run yourself; its
> use is governed by its license, the **MIT License** ([LICENSE](LICENSE)). This draft only collects
> the remaining facts and decisions the owner and a lawyer need. Every
> `[[PLACEHOLDER: …]]` is listed in [docs/trust/README.md](docs/trust/README.md#open-placeholders).

## License

DepTrace is licensed under the MIT License. The full text is in [LICENSE](LICENSE).

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

The MIT License provides the software "as is", without warranty of any kind, and limits the
authors' and copyright holders' liability; the binding wording is in [LICENSE](LICENSE). Whether
anything beyond the license is needed is part of the legal review.

## Acceptable use

`[[PLACEHOLDER: acceptable-use rules, if any beyond the license; requires legal review]]`

## Third-party services

Using DepTrace with GitHub Actions or installing it from npm (once published) is subject to those
platforms' own terms.

## Governing law and changes

`[[PLACEHOLDER: governing law, contact for legal notices, how changes are announced and the
effective date; requires legal review]]`
