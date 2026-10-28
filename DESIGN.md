---
name: DepTrace
description: A dark-first developer console where every finding arrives with its fix.
colors:
  tone-0: '#0a0d12'
  tone-1: '#0d1117'
  tone-2: '#151a22'
  tone-3: '#1b212b'
  tone-4: '#262c36'
  tone-5: '#39414d'
  tone-6: '#8b949e'
  tone-7: '#b1bac4'
  tone-8: '#e6edf3'
  rule-soft: '#1f252e'
  accent: '#79c0ff'
  accent-ink: '#0a0d12'
  accent-wash: '#12243a'
  good-ink: '#56d364'
  good-wash: '#10261a'
  cycle: '#d2a8ff'
  cycle-wash: '#231a33'
  warning: '#e3b341'
  warning-wash: '#2a2312'
  critical: '#f85149'
  critical-ink: '#ff7b72'
  critical-wash: '#2a1416'
  forbidden-wash: '#1f1517'
  same-wash: '#161c25'
  layer-1: '#3987e5'
  layer-2: '#d95926'
  layer-3: '#199e70'
  layer-4: '#c98500'
  layer-5: '#d55181'
  layer-6: '#008300'
  layer-7: '#9085e9'
  layer-8: '#e66767'
  layer-none: '#6b7480'
  graph-edge: '#4d5664'
  graph-package: '#a8957b'
  tone-0-light: '#f0f3f6'
  tone-1-light: '#f6f8fa'
  tone-2-light: '#ffffff'
  tone-3-light: '#f3f5f8'
  tone-4-light: '#d8dee4'
  tone-5-light: '#afb8c1'
  tone-6-light: '#59636e'
  tone-7-light: '#3d444d'
  tone-8-light: '#1f2328'
  rule-soft-light: '#e6eaef'
  accent-light: '#0969da'
  accent-ink-light: '#ffffff'
  accent-wash-light: '#ddf4ff'
  good-ink-light: '#1a7f37'
  good-wash-light: '#dafbe1'
  cycle-light: '#8250df'
  cycle-wash-light: '#fbefff'
  warning-light: '#bf8700'
  warning-ink-light: '#8a5c00'
  warning-wash-light: '#fff8c5'
  critical-light: '#cf222e'
  critical-ink-light: '#c21c2c'
  critical-wash-light: '#ffebe9'
  forbidden-wash-light: '#fff5f5'
  same-wash-light: '#f3f6f9'
  layer-1-light: '#2a78d6'
  layer-2-light: '#eb6834'
  layer-3-light: '#1baf7a'
  layer-4-light: '#eda100'
  layer-5-light: '#e87ba4'
  layer-6-light: '#008300'
  layer-7-light: '#6250d6'
  layer-8-light: '#e34948'
  layer-none-light: '#b4bcc6'
  graph-edge-light: '#9aa4b0'
  graph-package-light: '#7b6a55'
typography:
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '20px'
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: '-0.01em'
  wordmark:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '17px'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '-0.01em'
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '15px'
    fontWeight: 650
    lineHeight: 1.25
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: 'tnum'
  small:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '12px'
    fontWeight: 650
    letterSpacing: '0.08em'
  figure:
    fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: '30px'
    fontWeight: 600
    lineHeight: 1.15
  figure-ledger:
    fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: '13px'
    fontWeight: 400
  mono-small:
    fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.45
rounded:
  base: '6px'
  badge: '4px'
  count: '9px'
  dot: '50%'
spacing:
  xxs: '4px'
  xs: '6px'
  sm: '8px'
  md: '12px'
  panel: '18px'
  gap: '20px'
  page: '28px'
components:
  button:
    backgroundColor: '{colors.tone-2}'
    textColor: '{colors.tone-8}'
    rounded: '{rounded.base}'
    padding: '0 14px'
    height: '34px'
  button-hover:
    backgroundColor: '{colors.tone-3}'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.base}'
    padding: '0 14px'
    height: '34px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.tone-8}'
    rounded: '{rounded.base}'
    padding: '0 14px'
    height: '34px'
  button-small:
    typography: '{typography.small}'
    padding: '0 10px'
    height: '28px'
  button-pressed:
    backgroundColor: '{colors.accent-wash}'
    textColor: '{colors.tone-8}'
  input:
    backgroundColor: '{colors.tone-2}'
    textColor: '{colors.tone-8}'
    typography: '{typography.body}'
    rounded: '{rounded.base}'
    padding: '0 8px'
    height: '32px'
  tag:
    backgroundColor: '{colors.tone-3}'
    textColor: '{colors.tone-7}'
    rounded: '{rounded.badge}'
    padding: '0 7px'
    height: '22px'
  badge-error:
    backgroundColor: '{colors.critical-wash}'
    textColor: '{colors.critical-ink}'
    rounded: '{rounded.badge}'
    padding: '0 7px'
    height: '22px'
  badge-warning:
    backgroundColor: '{colors.warning-wash}'
    textColor: '{colors.warning}'
    rounded: '{rounded.badge}'
    padding: '0 7px'
    height: '22px'
  badge-new:
    backgroundColor: '{colors.accent-wash}'
    textColor: '{colors.accent}'
    rounded: '{rounded.badge}'
    padding: '0 7px'
    height: '22px'
  panel:
    backgroundColor: '{colors.tone-2}'
    textColor: '{colors.tone-8}'
    rounded: '{rounded.base}'
    padding: '18px'
  panel-head:
    typography: '{typography.label}'
    textColor: '{colors.tone-6}'
    padding: '10px 18px'
    height: '44px'
  strip-cell:
    backgroundColor: '{colors.tone-2}'
    typography: '{typography.figure}'
    padding: '16px 20px 18px'
  fix-summary:
    backgroundColor: 'transparent'
    textColor: '{colors.tone-8}'
    padding: '10px 18px'
    height: '48px'
  fix-summary-open:
    backgroundColor: '{colors.tone-3}'
  nav-item:
    backgroundColor: 'transparent'
    textColor: '{colors.tone-7}'
    rounded: '{rounded.base}'
    padding: '8px 10px'
  nav-item-hover:
    backgroundColor: '{colors.tone-2}'
    textColor: '{colors.tone-8}'
  nav-item-active:
    backgroundColor: '{colors.tone-3}'
    textColor: '{colors.tone-8}'
  graph-tooltip:
    backgroundColor: '{colors.tone-8}'
    textColor: '{colors.tone-2}'
    typography: '{typography.mono-small}'
    rounded: '{rounded.base}'
    padding: '6px 9px'
---

# Design System: DepTrace

## Overview

**Creative North Star: "The Dark Developer Console"**

DepTrace reads like the tooling a developer already lives in: a graphite ground, persistent panels one tonal step up, and structure drawn with 1px seams instead of depth. Health, the ranked fix list and the architecture sit on one surface at once, divided by seams rather than gutters, so the first screen answers "how healthy is this, and what do I fix first".

Colour is state, and state borrows from syntax highlighting: keyword blue for selection and the primary action, string green for passing, number purple for cycles, amber for warnings, red for errors and vulnerabilities. Every neutral comes from a single nine-step tonal ramp. Rank is carried by weight and case at a few working sizes, not by a type scale; every literal the analyzer prints (paths, fingerprints, rule IDs, figures) is set in the platform monospace. The world refuses the glowing KPI-tile wall and the light SaaS card grid.

Dark is the default. Light is a full variant, not an afterthought: the same ramp and accent roles, remapped, followed from the OS unless the reader picks Light or Dark in the rail.

**Key Characteristics:**

- One tonal ramp (`tone-0` to `tone-8`) supplies every neutral; surfaces differ by one step.
- 1px seams, no shadows; panels share seams inside one bordered surface.
- Syntax-derived accents encode state only, never decoration.
- System sans for UI; `ui-monospace` for paths, fingerprints, rule IDs and every figure.
- Tracked uppercase 12px labels head every panel.
- Gently squared 6px corners; badges 4px.
- The fix strip: a finding opens in place into its rule, its cause and a monospaced fix line.

## Colors

A cool graphite ramp with five syntax accents and a validated categorical layer set. Dark values are normative in the frontmatter; each `-light` key is the same role in the light theme.

### Primary

- **Keyword Blue** (`accent`): the primary button, links, focus rings, the active nav icon, the selected graph node ring and overlay, pressed toggles, the "new" baseline badge. `accent-wash` is selection: selected rows, list items, search results, matrix selection, text selection. `accent-ink` is text on a solid accent face.

### Secondary (state)

- **String Green** (`good-ink`, `good-wash`): passing. The analysis-ok status dot, resolved baseline badge, the fix line's icon and its monospaced command, the allowed-policy legend.
- **Number Purple** (`cycle`, `cycle-wash`): cycles only. Cycle edges in the graph, the runtime-cycles figure, cycle leads in "Also in the analysis".
- **Warning Amber** (`warning`, `warning-wash`; light theme adds a darker `warning-ink`): warning severity, warning node rings, the diagnostics status dot, moderate advisories.
- **Error Red** (`critical`, `critical-ink`, `critical-wash`): errors, violations, high and critical advisories, violation edges, broken directions in the layer diagram, used forbidden matrix cells. `critical-ink` is the text tone; `critical` is borders and strokes.
- **Policy washes** (`same-wash`, `forbidden-wash`): the layer matrix's same-layer and forbidden-but-unused cells.

### Tertiary (data)

- **Layer hues** (`layer-1` to `layer-8`, `layer-none`): layer identity in swatches, layer bars, the layer diagram and graph node fill, in the validated categorical order. Unchanged from the previous world.
- **Graph neutrals** (`graph-edge`, `graph-package`): default edges and external-package diamonds and their dotted edges. The canvas ground is `tone-1` (white `tone-2` in light) and node rings are `tone-0` (white in light).

### Neutral

The ramp, dark to light in the dark theme (and light to dark in the light theme):

- **Rail Black** (`tone-0`): the navigation rail; graph node rings.
- **Graphite Ground** (`tone-1`): the page and the graph canvas.
- **Panel** (`tone-2`): panels, strips, lists, tables, inputs, buttons; rail hover.
- **Elevated Panel** (`tone-3`): one more step: the open fix summary and fix body, table heads, row hover, tags, code blocks, the active nav item.
- **Seam** (`tone-4`): every container border and panel divider. `rule-soft` (between `tone-3` and `tone-4`) separates rows inside a container.
- **Strong Seam** (`tone-5`): control borders, overlays, dashed empty states, scrollbars.
- **Muted Ink** (`tone-6`): receding text: path folders, panel labels, meta, footnotes.
- **Secondary Ink** (`tone-7`): secondary text and inactive nav lettering.
- **Ink** (`tone-8`): primary text.

### Named Rules

**The One Ramp Rule.** Every neutral is a `tone-*` step. A surface is one step from what it sits on (ground `tone-1`, panel `tone-2`, elevated `tone-3`); seams are `tone-4`, control and overlay borders `tone-5`. Do not introduce a neutral outside the ramp.

**The Syntax State Rule.** Accents mean state and nothing else: blue is selection and the primary action, green is passing or a fix, purple is a cycle, amber is a warning, red is an error or vulnerability. An accent never decorates a heading, a panel or a brand element.

**The Never-Cycled Rule.** Layers take `layer-1`..`layer-8` in configured order; the ninth layer onward and unclassified files share `layer-none`. Hues are never reused for a second layer.

**The Signed Status Rule.** Error and warning always appear with an icon and a text label (the badge reads "error" or "warning"). Colour alone never carries a severity.

## Typography

**Display Font:** none; the system has no display face.
**Body Font:** system sans (`system-ui, -apple-system, 'Segoe UI', Roboto, …`)
**Label/Mono Font:** `ui-monospace` (with Cascadia Code, SF Mono, Menlo, Consolas fallbacks)

**Character:** The platform's own sans at modest sizes, so the console reads like the user's editor; rank comes from weight (650) and tracked uppercase, not from size jumps. Monospace marks what is literal: what the CLI prints and what the reader would type.

### Hierarchy

- **Headline** (650, 20px, 1.25, -0.01em): page titles (`h1`), balanced wrapping.
- **Wordmark / project name** (700 and 650, 17px): the rail wordmark and the top bar project name.
- **Title** (650, 15px, 1.25): `h2` headings and the selected item's call in the detail card.
- **Body** (400, 14px, 1.6, tabular figures): all UI text; prose capped at 70-75ch.
- **Small** (400, 13px): meta, finding messages, panel links, legends; 12.5px for rule lines and `line:column` locations.
- **Label** (650, 12px, 0.08em, uppercase, `tone-6`): panel headers, health-strip cell labels, detail-card section headings ("What it breaks", "Dependency path"), and in-panel group headings.
- **Figure** (mono 600, 30px, 1.15): the health-strip counts, in their state colour; 24-26px on small or short screens.
- **Ledger figure** (mono 600, 15px): analysis ledger values, right-aligned.
- **Mono** (13px paths and finding locations; 12px fingerprints, rail counts, refs and the graph tooltip; 0.92em inline code).

### Named Rules

**The Literal Is Mono Rule.** Paths, fingerprints, rule IDs, import kinds, commands and every figure are set in `ui-monospace`. Headings, prose, controls and the wordmark are system sans.

**The Weight Not Size Rule.** The interface works at 14px and 13px; hierarchy above that comes from 650 weight and tracked uppercase labels, with 20px reserved for the page title and 30px for health figures.

**The Path Lettering Rule.** In a path the folder recedes to `tone-6` and the file name reads in ink (the folder returns to ink on link hover). Long identifiers wrap only after "/" unless nothing else fits.

## Layout

A two-column shell: a 228px rail in `tone-0` (sticky, full height, its colour continued down the column on long pages) and a work column with a sticky 56px top bar carrying the project name, analysis status dot, file and dependency counts, version, commit time, Re-analyze and Import report. Pages pad 24px 28px 48px and stack sections with 20px gaps.

The overview opens with a health strip: four seamed cells inside one bordered surface (auto-fit, 220px minimum), each a label, a mono figure and a detail line. Below it a console: one bordered surface split 1.6fr to 1fr, the ranked fix list left, the Layers and Analysis panels stacked right, all divided by seams rather than gutters. Detail views split into a list and a sticky detail card column (360-440px). The graph route fills the viewport height: canvas left, a 320-400px side column, filters and legend as drawers over the canvas.

Spacing steps are 4, 6, 8, 10, 12, 14, 18, 20, 24 and 28px; panels pad 18px, list rows 10px 14px or 10px 18px, table cells 7px 12px.

Responsive behaviour:

- **1399px and narrower:** wide-only top bar facts hide.
- **1280px and narrower:** the graph side column drops below the canvas (canvas 70vh).
- **1080px and narrower:** the console stacks to one column (seam moves to the top); the detail card stacks under its list.
- **860px and narrower:** the rail becomes an off-canvas drawer (min(280px, 85vw)) opened by the menu button; the top bar wraps and stops being sticky; page padding drops to 16px.
- **560px and narrower:** the health strip runs two columns with 24px figures.
- **520px and narrower:** module tables become list rows; facts go single-column; top bar actions go full width.
- **Short laptops (901px+ wide, 720px or less tall):** tighter page gap (14px), strip padding and 26px figures so the first fix stays above the fold.

## Elevation & Depth

The system is flat. There are no shadows. Depth is a tonal step on the ramp (ground, panel, elevated panel) and a 1px seam. Overlays (search results, the filter drawer, the legend, the open mobile rail) separate from what they cover with a `tone-5` border. The one "lift" is focus, not elevation: in the graph, focusing a node or finding dims everything outside its reach to 12% opacity and thickens the lit edges to 3px.

### Named Rules

**The Seam Not Shadow Rule.** Structure is a 1px line: `tone-4` around and between panels, `rule-soft` between rows inside one, `tone-5` around controls and overlays. Nothing casts a shadow.

**The Total Focus Rule.** Selection lifts by contrast, not by depth: the selected item takes the accent and everything unrelated dims.

## Shapes

Gently squared: 6px corners on controls, panels, lists, tables, the graph canvas and the tooltip; 4px on tags, badges and inline commands. Panels inside a shared surface drop their own corners and borders and share the outer one. Fully round only for status dots, layer swatches, path-chain nodes and graph nodes; the section count pill is 9px. Dashed borders mean "not yet / not present" (empty states, the drop zone, the existing-baseline badge); a hatched fill means ungoverned in the layer matrix. Bars round 4px on the right only.

## Components

### Buttons

Quiet, seamed, compact.

- **Shape:** 6px corners, 34px tall, 14px side padding, weight 550.
- **Default:** panel face (`tone-2`) with a `tone-5` border; hover moves to `tone-3` with a `tone-6` border; active `rule-soft`.
- **Primary:** solid `accent` face and border with `accent-ink` text; hover mixes 14% ink into the accent. One per view (Re-analyze in the top bar).
- **Ghost:** transparent until hover, then `tone-3` with a `tone-4` border.
- **Small / icon-only:** 28px tall, 10px padding, 13px; icon-only is 32px wide.
- **Pressed toggles** (`aria-pressed`): `accent-wash` face, `accent` border. Busy buttons spin their icon.
- **Focus:** a 2px `accent` outline at 2px offset, everywhere.

### Chips

- **Style:** tags and badges share one form: 22px, 4px corners, `tone-4` border, `tone-3` face, 12px `tone-7` text.
- **Severity:** error and warning badges take their wash, border and ink at weight 600, always with an icon and the word.
- **Baseline:** new is `accent` text and border on `accent-wash`; accepted/existing is the plain tag (dashed for existing); resolved is a `good-ink` outline on transparent.

### Cards / Containers

- **Corner Style:** 6px.
- **Background:** `tone-2` on `tone-1`; the open or hovered part of a container steps to `tone-3`.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `tone-4`; rows inside separated by `rule-soft`.
- **Panel head:** a 44px band with a tracked uppercase label left, meta and a panel link (accent, with an arrow) right, closed by a `tone-4` seam.
- **Internal Padding:** 18px panels; 16px 20px 18px strip cells.

### Inputs / Fields

- **Style:** 32px, `tone-5` border, `tone-2` face, 6px corners, 14px sans; placeholders in `tone-6`; 12px `tone-7` labels above.
- **Focus:** the global 2px `accent` outline; hover darkens the border to `tone-6`.
- **Checkboxes** take `accent`; segmented controls join with `tone-5` dividers and an `accent-wash` pressed segment.

### Navigation

- **Rail:** `tone-0`, items 8px 10px with 6px corners, a 16px icon, `tone-7` lettering and a mono `tone-6` live count on the right.
- **Hover:** `tone-2` face, ink lettering.
- **Active:** `tone-3` face, weight 650, ink lettering, and the icon in `accent`.
- **Theme switch:** a three-way System / Light / Dark icon fieldset at the foot of the rail; the checked option takes `tone-2` and a `tone-6` border.
- **Mobile:** below 860px the rail is a drawer behind the menu button.

### Fix Strip (signature)

The ranked finding list. Each row (48px minimum, 10px 18px) reads on line one: severity badge, the mono `path:line:column`, baseline status, a chevron; line two: the mono rule ID and the fingerprint in `tone-6`. Opening a row steps it to `tone-3` and unfolds (260ms, `cubic-bezier(0.16, 1, 0.3, 1)`) into the message, a fix line (a `tone-2` box with a green wrench icon, the import that causes it in mono, and the fix prose), then Details and Show in graph. The first finding opens by default.

### Health Strip (signature)

Four seamed cells in one bordered surface: label, a 30px mono figure in its state colour (red errors, amber warnings, purple cycles, green when clean) and a detail line. A cell with nothing checked yet holds its action (Check dependencies) at the figure's height.

### Dependency Graph

- **Fill** is the layer colour; external packages are `graph-package` diamonds; folders are rounded rectangles. Labels in 18px mono `tone-7` on a ground-coloured plate.
- **Ring:** 1px `tone-0` by default; 3px `critical` or `warning` marks a violation source; the selected node takes a 3px `accent` ring and an 18% accent overlay.
- **Edges:** 1.25px `graph-edge` at 60% opacity with arrows; dashed (5/4) for type-only, dotted `graph-package` to packages, 2px `cycle` in a cycle, 2.5px `critical` for a violation, both at full opacity.
- **Focus:** everything outside the selection's reach dims to 12%.
- **Tooltip:** inverted (ink face, panel text), 12px mono, no border, no shadow.

### Icons

One family: 24px grid, 1.75 stroke, round caps and joins, `currentColor`, inline SVG, usually at 16px. Disclosure markers come from the family and rotate 180deg when open; the browser triangle is hidden.

## The showcase site

The showcase website in `site/` still carries the previous "Catalog Cards" world (light ruled stock, oak bands, the red index rule). It is not governed by these tokens and does not match the dashboard; it keeps its own stylesheet until it is redesigned, and no site tokens are recorded here.

## Do's and Don'ts

### Do:

- **Do** take every neutral from the `tone-0`..`tone-8` ramp, one step per layer of surface.
- **Do** draw structure with 1px seams: `tone-4` around and between panels, `rule-soft` between rows, `tone-5` around controls and overlays.
- **Do** keep accents to state: blue selection and primary action, green passing, purple cycles, amber warnings, red errors.
- **Do** head every panel with a 12px, 650, 0.08em tracked uppercase label in `tone-6`.
- **Do** set paths, fingerprints, rule IDs, commands and every figure in `ui-monospace`, and everything else in the system sans.
- **Do** pair every error and warning colour with an icon and a text label.
- **Do** assign layer colours in the validated order and send the ninth layer onward to `layer-none`.
- **Do** ship both themes from the same roles: dark by default, light via `prefers-color-scheme` or `data-theme`.
- **Do** keep transitions at 150-200ms ease-out on colour, opacity and transform, and honour reduced motion.

### Don't:

- **Don't** use shadows, glows or raised tiles; overlays separate with a `tone-5` border.
- **Don't** round corners beyond 6px (4px for badges), except dots, swatches and graph nodes.
- **Don't** use an accent to decorate headings, panels or the brand; red never marks navigation or selection.
- **Don't** use `cycle` purple for anything but cycles.
- **Don't** cycle layer hues or invent a ninth hue.
- **Don't** set the wordmark, headings or prose in monospace.
- **Don't** build a glowing KPI-tile wall or a light SaaS card grid; counts live in the seamed health strip and the ledger.
