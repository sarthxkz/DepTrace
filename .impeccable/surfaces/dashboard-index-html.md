---
version: 1
slug: "dashboard-index-html"
primary_target: "dashboard/index.html"
related_targets: []
---

# Dashboard surface brief

Scope: the DepTrace dashboard (`dashboard/`), every route. Visitor mode: Operate.
Audience: a developer exploring their own repository locally, and a reviewer opening a report produced elsewhere (CI). Task: see the health of the codebase (violations, cycles, vulnerable dependencies), know what to fix first and how, and explore what depends on what.
Constraints: every value from the analyzer or audit report; zero vs missing vs unsupported vs not checked stated plainly; graphs may be thousands of files; the only network use is the user-triggered dependency audit (package names and versions to the npm registry), said so at the button.
User feedback driving the redesign (2026-10-28): the old look felt dated and plain, the graph was hard to use, and pages were too dense and cramped. The first screen must be health plus what to fix.

## Direction contract

THESIS: A dark-first developer console where every finding arrives with its fix. Persistent panels divided by 1px seams show health, the ranked fix list and the architecture at once; it refuses the glowing KPI-tile wall and the light SaaS card grid.

OWN-WORLD: Graphite ground (#0d1117), panels one step up (#151a22), elevated one more (#1b212b), 1px seams (#262c36), no shadows, no rounded tiles beyond 6px. Syntax-derived accents for state only: keyword blue for selection and the primary action, string green for passing, number purple for cycles, warning amber, destructive red. System sans for UI at two working sizes, ui-monospace for paths, fingerprints and every figure; panel headers in tracked small caps.

STORY: The visitor reads the health strip, takes the first item in Where to start, reads its fix, opens the file in the graph to see its reach, then checks dependencies for known vulnerabilities and applies the suggested update.

FIRST VIEWPORT: Left rail (sections with live counts). Top bar: project, analysis status dot, files and dependencies, version, branch and commit, Re-analyze. Health strip of four seamed cells: errors (with new), warnings, runtime cycles, vulnerable packages (or Check dependencies). Below, two panels: Where to start (ranked findings, the first expanded with its fix) and Layers (a stacked layer diagram with broken directions drawn in red).

FORM: Dark Developer Console, a catalog challenger chosen by the user over the assigned Orienteering Course (position 3 of my ordered list) and the Transit Diagram pick. seed:0b9b8ba89ef241c4. Raised by: two working type sizes with rank carried by weight and case (Timetable Slide Rack); a stable code on every finding, the fingerprint (Factory Catalog Sleeve); one tonal ramp as the only neutrals (Exposure Record Sheets); total focus, the selected item lifts and everything else dims (Streaming Title Wall). Signature interaction: the fix strip, a finding opens in place into its rule, the import that causes it and a monospaced fix line, and the graph dims to that finding's files.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
