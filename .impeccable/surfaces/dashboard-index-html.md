---
version: 1
slug: "dashboard-index-html"
primary_target: "dashboard/index.html"
related_targets: []
---

# Dashboard surface brief

Scope: the DepTrace dashboard (`dashboard/`), every route. Visitor mode: Operate.
Audience: a developer exploring their own repository locally, and a reviewer opening a report produced elsewhere (CI). Task: find what depends on what, where cycles and violations are, and why; decide what to investigate first.
Constraints: every value from the analyzer report; zero vs missing vs unsupported stated plainly; graphs may be thousands of files; local-only, no external requests.

## Direction contract

THESIS: Every module is a catalog card. The dashboard is a card catalog of the codebase: a file path is a call number, its imports and importers are cross-references, and selecting anything pulls its card. It refuses the category default of a dark KPI-tile wall with a glowing graph.

OWN-WORLD: White ruled index stock on a pale blue-gray ground; an oak drawer rail (#5E4429 family) as the shell; one index-card red rule on the pulled card header only; blue ruling hairlines (1px) carry all structure — no shadows, no floating cards, no rounded tiles. System sans for UI, ui-monospace only for paths and fingerprints. Layer identity uses the validated categorical order; error/warning use the fixed status palette with icon and label.

STORY: The visitor sees what the analysis found and where to start, pulls a module's card to read its cross-references, follows a path or cycle across the graph, and understands which rule a finding breaks and which import causes it.

FIRST VIEWPORT: Oak rail with navigation on the left; a header with project name, analysis status, analyzer version, branch/commit when known and the re-analyze action. Overview: a ruled summary ledger of real counts across the top, "Where to start" findings list beneath on the left, layer and rule breakdowns on the right. In the graph route the canvas fills the work area and the pulled card sits in a right column.

FORM: Catalog Cards, position 5 of my ordered grounded list (assigned). seed:73b2add5498ee3e3. Raised by: hairline-only structure (Annual Plates); focus dims everything not connected (Title Wall); one depth control drives the transitive highlight live (Type Specimen). Signature interaction: pulling a card — selecting a module anywhere opens its red-ruled catalog card with Imports / Imported by cross-references, and the graph dims to that module's reach.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
