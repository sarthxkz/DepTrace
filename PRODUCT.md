# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The dashboard is a Vite + React + Cytoscape.js single-page app, built into `dist/dashboard` and served on localhost by `deptrace dashboard` (confirmed). It is styled with plain CSS design tokens and has no runtime dependencies beyond the CLI's own. The analyzer CLI itself is TypeScript on Node 22+ (commander, yaml, picomatch, typescript).

## Users

There are two primary users (confirmed):

- **A developer working locally.** They run DepTrace against their own repository to understand its structure, track down a cycle or a forbidden import, and decide what to untangle first.
- **A reviewer or tech lead opening a report made elsewhere.** For example, a JSON report produced in CI. They judge violations, accepted (baseline) versus new findings, and where the architecture drifts.

## Product Purpose

DepTrace is a static architecture analyzer for TypeScript and JavaScript repositories ("See your architecture. Catch violations before they ship.").

- **Analysis:** it parses imports without running repository code. It builds a file-level dependency graph and detects cycles as strongly connected components.
- **Rules:** it evaluates the rules in `deptrace.yml`: layer boundaries, forbidden imports, forbidden packages, module boundaries and circular dependencies.
- **CI enforcement:** it enforces those rules in CI, with baselines, SARIF and GitHub annotations.

The dashboard makes the same analysis explorable. Success means a developer can answer "what depends on what, where are the cycles, which rules are violated, and why" from real analyzer output, without guessing.

## Positioning

Every number and relationship shown comes from DepTrace's own deterministic analysis and configured policy. That includes the exact import references (line and column), configured layers and rules, stable violation fingerprints and baseline classifications. Nothing is approximated, scored or inferred.

## Operating Context

The dashboard runs locally next to the terminal and the editor. Reports flow through `deptrace report --format json`, `deptrace check --report`, SARIF from CI, and `deptrace-baseline.json` committed in the repository. Graphs range from a few dozen files to many thousands.

## Capabilities and Constraints

- **Static analysis only.** Relationships are static imports, not runtime calls.
- **Modules are files.** A "module" in the dashboard is a source file; external packages are package names.
- **Deterministic output.** No absolute paths appear in reports, and nothing is sent externally (no telemetry, no hosted backend, no authentication).
- **No history.** Historical snapshots are not stored; trends are not available.

## Brand Commitments

- **Naming.** The product is named DepTrace, with the CLI `deptrace` and the npm package `deptrace-cli`. No ArchLens/ArchGuard/Struktaq branding.
- **Tagline.** "See your architecture. Catch violations before they ship."

## Evidence on Hand

Real analyzer output comes from the fixture repositories in `tests/fixtures/` and from DepTrace analyzing itself. There are no customers, testimonials or benchmarks beyond `docs/performance.md`, so none may be invented.

## Product Principles

- Show only what the analyzer actually produced; say clearly when data is missing, unsupported or zero.
- Make the reason behind every finding inspectable: the rule, the import, the path.
- Large graphs are explored by search and filtering, never silently truncated.
- Local-first and private by default.

## Accessibility & Inclusion

Keyboard operable, with visible focus, accessible labels, and WCAG AA contrast in both light and dark themes. (This is the target standard; no product-specific requirements were given.)
