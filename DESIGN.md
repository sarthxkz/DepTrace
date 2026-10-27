---
name: DepTrace
description: The dashboard as a card catalog of the codebase; every module is an index card.
colors:
  ground: '#edf1f5'
  stock: '#ffffff'
  stock-2: '#f5f7fa'
  ink: '#1b1e23'
  ink-2: '#48505b'
  ink-3: '#626b77'
  rule: '#cdd8e4'
  rule-soft: '#e2e9f0'
  rule-strong: '#9fb2c7'
  rail: '#5e4429'
  rail-2: '#4e381f'
  rail-ink: '#f6efe3'
  rail-ink-2: '#e2d3bb'
  index-red: '#c2362f'
  accent: '#2f5d8c'
  accent-ink: '#ffffff'
  accent-wash: '#e3ecf6'
  critical: '#d03b3b'
  critical-ink: '#b42318'
  critical-wash: '#fbe9e7'
  forbidden-wash: '#fdf4f3'
  same-wash: '#f0f4f9'
  warning: '#fab219'
  warning-ink: '#8a5300'
  warning-wash: '#fff4dc'
  good-ink: '#006300'
  cycle: '#a3296f'
  layer-1: '#2a78d6'
  layer-2: '#eb6834'
  layer-3: '#1baf7a'
  layer-4: '#eda100'
  layer-5: '#e87ba4'
  layer-6: '#008300'
  layer-7: '#6250d6'
  layer-8: '#e34948'
  layer-none: '#b4bcc6'
  graph-ground: '#ffffff'
  graph-edge: '#8d9bab'
  graph-node-ring: '#3b434d'
  graph-package: '#7b6a55'
  ground-dark: '#111317'
  stock-dark: '#1a1d22'
  stock-2-dark: '#21252b'
  ink-dark: '#e9ecef'
  ink-2-dark: '#b8c0ca'
  ink-3-dark: '#959eaa'
  rule-dark: '#2e343c'
  rule-soft-dark: '#262b32'
  rule-strong-dark: '#4a545f'
  rail-dark: '#2b2016'
  rail-2-dark: '#3a2c1e'
  rail-ink-dark: '#efe5d5'
  rail-ink-2-dark: '#c9b89e'
  index-red-dark: '#e2675f'
  accent-dark: '#8db4e2'
  accent-ink-dark: '#0d1520'
  accent-wash-dark: '#1d2a3a'
  critical-ink-dark: '#f08a84'
  critical-wash-dark: '#3a1d1c'
  forbidden-wash-dark: '#251b1c'
  same-wash-dark: '#1f2530'
  warning-ink-dark: '#f5c35a'
  warning-wash-dark: '#3a2e14'
  good-ink-dark: '#4cc24c'
  cycle-dark: '#e07ab8'
  layer-1-dark: '#3987e5'
  layer-2-dark: '#d95926'
  layer-3-dark: '#199e70'
  layer-4-dark: '#c98500'
  layer-5-dark: '#d55181'
  layer-6-dark: '#008300'
  layer-7-dark: '#9085e9'
  layer-8-dark: '#e66767'
  layer-none-dark: '#6b7480'
  graph-ground-dark: '#1a1d22'
  graph-edge-dark: '#66727f'
  graph-node-ring-dark: '#0d0f12'
  graph-package-dark: '#a8957b'
typography:
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '20px'
    fontWeight: 650
    lineHeight: 1.25
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '15px'
    fontWeight: 650
    lineHeight: 1.25
  wordmark:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '17px'
    fontWeight: 650
    lineHeight: 1
    letterSpacing: '-0.01em'
  figure:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '18px'
    fontWeight: 650
    fontFeature: 'tnum'
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
  subhead:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 650
    lineHeight: 1.25
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '12px'
    fontWeight: 400
  card-section-label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '12px'
    fontWeight: 650
    letterSpacing: '0.06em'
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
  card: '2px'
  base: '3px'
  count: '9px'
  dot: '50%'
spacing:
  xxs: '4px'
  xs: '6px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
  xxl: '24px'
components:
  button:
    backgroundColor: '{colors.stock}'
    textColor: '{colors.ink}'
    rounded: '{rounded.base}'
    padding: '0 12px'
    height: '32px'
  button-hover:
    backgroundColor: '{colors.stock-2}'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.base}'
    padding: '0 12px'
    height: '32px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.base}'
    padding: '0 12px'
    height: '32px'
  button-small:
    padding: '0 8px'
    height: '26px'
  button-pressed:
    backgroundColor: '{colors.accent-wash}'
    textColor: '{colors.ink}'
  input:
    backgroundColor: '{colors.stock}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.base}'
    padding: '0 8px'
    height: '32px'
  tag:
    backgroundColor: '{colors.stock-2}'
    textColor: '{colors.ink-2}'
    typography: '{typography.label}'
    rounded: '{rounded.base}'
    padding: '0 7px'
    height: '21px'
  badge-error:
    backgroundColor: '{colors.critical-wash}'
    textColor: '{colors.critical-ink}'
    rounded: '{rounded.base}'
    padding: '0 7px'
    height: '21px'
  badge-warning:
    backgroundColor: '{colors.warning-wash}'
    textColor: '{colors.warning-ink}'
    rounded: '{rounded.base}'
    padding: '0 7px'
    height: '21px'
  badge-baseline-new:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.stock}'
    rounded: '{rounded.base}'
    padding: '0 7px'
    height: '21px'
  catalog-card:
    backgroundColor: '{colors.stock}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
  catalog-card-head:
    typography: '{typography.title}'
    padding: '14px 16px 12px'
  card-section:
    padding: '12px 16px'
  panel:
    backgroundColor: '{colors.stock}'
    rounded: '{rounded.base}'
    padding: '16px'
  nav-item:
    backgroundColor: 'transparent'
    textColor: '{colors.rail-ink}'
    rounded: '{rounded.base}'
    padding: '8px 10px'
  nav-item-hover:
    backgroundColor: '{colors.rail-2}'
  nav-item-active:
    backgroundColor: '{colors.rail-2}'
    textColor: '{colors.rail-ink}'
  graph-tooltip:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.stock}'
    typography: '{typography.mono-small}'
    rounded: '{rounded.base}'
    padding: '6px 9px'
---

# Design System: DepTrace

## Overview

**Creative North Star: "The Card Catalog"**

Every module is a catalog card. The dashboard is a card catalog of the codebase: a file path is a call number, its imports and importers are cross-references, and selecting anything pulls its card. White ruled index stock sits on a pale ruling-blue ground, the shell is an oak drawer rail, and one index-card red rule marks the card that has been pulled. Everything structural is drawn the way a library card is printed: with thin blue ruling, never with depth.

Density is that of a working tool used next to the editor: 14px body, 32px controls, tables and ruled lists rather than tiles. Colour is reserved for meaning. The oak rail and the red rule are the only material colours; blue is the interaction accent; layer hues, status hues and the cycle magenta each encode one thing in data and never decorate. The world refuses the category default of a dark KPI-tile wall with a glowing graph.

Both themes are first-class. The light theme is the catalog in daylight; the dark theme keeps the same structure with a darker oak and ruling, and follows the OS unless the reader picks Light or Dark in the rail.

**Key Characteristics:**

- Hairline structure: 1px ruling carries every boundary, no shadows anywhere.
- An oak drawer rail as the shell; the open drawer is a lighter face with a hairline label holder.
- One red rule, on the pulled catalog card's header only.
- Paths lettered as call numbers: folder recedes, file name reads first, breaks only after "/".
- Monospace only for literal identifiers the CLI prints; everything else is system sans.
- Data colour is categorical, validated and never cycled.

## Colors

A cool paper-and-ruling palette with two warm materials (oak and index red) and a strictly semantic set of data hues. Light values are normative in the frontmatter; each `-dark` key is the same role in the dark theme.

### Primary

- **Ruling Blue Ink** (`accent`): links, the primary button, focus rings, the selected graph node, pressed toggles. Its wash (`accent-wash`) marks selected rows, list items and search results, and text selection.

### Secondary

- **Oak Drawer** (`rail`): the navigation rail and, on narrow screens, the 4px band on top of the header. `rail-2` is the open-drawer face (hover and active nav, checked theme option); `rail-ink` and `rail-ink-2` are the rail's lettering and hairlines.
- **Index-Card Red** (`index-red`): the 2px rule under the pulled catalog card's header. Nothing else.

### Tertiary (data and status)

- **Status Red** (`critical`, `critical-ink`, `critical-wash`): error severity, violation edges, error rings on graph nodes, used forbidden matrix cells.
- **Status Amber** (`warning`, `warning-ink`, `warning-wash`): warning severity, warning rings, diagnostics status dot.
- **Clean Green** (`good-ink`): analysis-ok status dot, resolved baseline badge, allowed-policy legend.
- **Cycle Magenta** (`cycle`): edges inside a strongly connected component. Only for cycles.
- **Layer hues** (`layer-1` to `layer-8`, `layer-none`): layer identity in swatches and graph node fill, in the validated dataviz categorical order.
- **Policy washes** (`same-wash`, `forbidden-wash`): the layer matrix's same-layer and forbidden-but-unused cells.

### Neutral

- **Ruling Ground** (`ground`): the page behind the cards.
- **Index Stock** (`stock`, `stock-2`): cards, panels, tables, inputs; `stock-2` is table heads, hover and code blocks.
- **Ink** (`ink`, `ink-2`, `ink-3`): primary text, secondary text, and receding text (path folders, labels, footnotes). `ink-3` meets AA on stock.
- **Ruling** (`rule`, `rule-soft`, `rule-strong`): container borders, row separators inside a container, and control and overlay borders respectively.
- **Graph neutrals** (`graph-ground`, `graph-edge`, `graph-node-ring`, `graph-package`): canvas, default edge, node outline, external-package nodes and edges.

### Named Rules

**The One Red Rule.** `index-red` appears only as the 2px rule on the header of a pulled catalog card. The active nav item is the open-drawer face (`rail-2` plus a 1px inset `rail-ink-2` hairline), never red.

**The Never-Cycled Rule.** Layers take `layer-1`..`layer-8` in configured order, the categorical order validated with the dataviz palette validator against white and `#1c1f24`. A ninth layer and beyond, and unclassified files, share `layer-none`. Hues are never reused for a second layer.

**The Signed Status Rule.** Error and warning always use the fixed status palette and always appear with an icon and a text label. Colour alone never carries a severity.

## Typography

**Display Font:** none; the system has no display face.
**Body Font:** system sans (`system-ui, -apple-system, 'Segoe UI', Roboto, …`)
**Label/Mono Font:** `ui-monospace` (with Cascadia Code, SF Mono, Menlo, Consolas fallbacks)

**Character:** The platform's own sans, set tight and modest, so the interface reads like the user's own tooling. Mono is a typed-identifier face, not a style.

### Hierarchy

- **Headline** (650, 20px, 1.25): page titles (`h1`), balanced wrapping.
- **Wordmark / project name** (650, 17px): the rail wordmark (letter-spacing -0.01em) and the header project name.
- **Title** (650, 15px, 1.25): panel headings and the catalog card's call (the path).
- **Subhead** (650, 13px): `h3` inside panels.
- **Body** (400, 14px, 1.5): all UI text; prose capped at 70-75ch.
- **Figure** (650, 18px, tabular): ledger counts. All counts and numeric columns use tabular figures.
- **Label** (400, 12px): field labels, legends, table heads (600), tags.
- **Card section label** (650, 12px, 0.06em, uppercase, `ink-2`): the heading of each section inside a catalog card (Imports, Imported by), followed by a count pill.
- **Mono** (13px for path links; 12px for line:column refs, chain steps and the graph tooltip; 0.92em inline).

### Named Rules

**The Typed Identifier Rule.** Monospace is used for paths, fingerprints, rule IDs and import kinds, because each is a literal identifier typed in `deptrace.yml` or printed by the CLI. The wordmark and all other UI text use the system sans.

**The Call Number Rule.** A path is lettered as a call number: the folder in `ink-3`, the file name in ink (the folder returns to full ink on link hover). Paths and long identifiers wrap only after "/" (a `<wbr>` after each slash), or anywhere only when nothing else fits.

## Layout

A two-column shell: a 216px oak rail (sticky, full height; its colour continues down the column on long pages) and a work column with a sticky 60px header carrying project name, status, analyzer facts and the re-analyze action. Pages pad 20px 24px 40px and stack sections with 16px gaps.

Detail views split into a list and a pulled card column (360-440px) that stays sticky under the header. The graph route fills the viewport height: canvas left, a 320-400px side column for the pulled card or focus hint, filters as a drawer floating over the canvas so the graph keeps its width.

Spacing steps are 4, 6, 8, 12, 16, 20 and 24px; 1px gaps separate rail items.

Responsive behaviour:

- **1280px and narrower:** the graph side column drops below the canvas (canvas 70vh).
- **1080px and narrower:** the pulled card stacks under the list and is scrolled into view.
- **1240px and wider:** the overview ledger runs four columns instead of two.
- **860px and narrower:** the rail becomes an off-canvas drawer (min(280px, 85vw), opened by a menu button, edged with `rule-strong`); the header gets a 4px oak band on top, wraps, and is no longer sticky; page padding drops to 16px; ledger and overview grid go single-column.
- **520px and narrower:** module tables become list rows (path on its own full-width line, labelled values beneath); facts lists go single-column; header actions go full width.

## Elevation & Depth

The system is flat. There are no drop shadows. Depth is never simulated; separation is drawn with 1px ruling and tonal steps between `ground`, `stock` and `stock-2`. Overlays (search results, the filter drawer, the open mobile rail) separate from what they cover with a `rule-strong` border, not a shadow. The only `box-shadow` uses are inset 1px hairlines (the open-drawer nav item, the brand mark's ruled line), which are lines, not elevation.

### Named Rules

**The Ruled Not Raised Rule.** Structure is a 1px hairline: `rule` around a container, `rule-soft` between rows inside it, `rule-strong` around controls and overlays. Nothing floats.

## Shapes

Nearly square: 3px corners on controls, panels and tags; 2px on the catalog card, so it reads as cut stock. Fully round only for status dots, layer swatches, path-chain nodes and graph nodes; the count pill is 9px. Dashed borders mean "not yet / not present" (empty states, drop zone, existing-baseline badge); a hatched fill means ungoverned in the layer matrix. Bars in bar lists square on the left and round 4px on the right.

## Components

### Buttons

Quiet, ruled, and compact.

- **Shape:** gently squared (3px), 32px tall, 12px side padding, weight 550.
- **Default:** stock face with a `rule-strong` border; hover moves to `stock-2` with an `ink-3` border; active `rule-soft`.
- **Primary:** `accent` face and border, `accent-ink` text; hover darkens the border to ink.
- **Ghost:** transparent until hover, then `stock-2` with a `rule` border.
- **Small / icon-only:** 26px tall, 8px padding, 13px; icon-only is a 32px square.
- **Pressed toggles** (`aria-pressed`): `accent-wash` face, `accent` border. Busy buttons spin their icon.
- **Focus:** 2px `accent` outline at 2px offset, everywhere (`rail-ink` inside the rail).

### Chips

- **Style:** tags and badges share one form: 21px, 3px corners, `rule` border, `stock-2` face, 12px `ink-2` text.
- **Severity:** error and warning badges take their wash, border and ink, weight 600, with an icon and label.
- **Baseline:** new is solid ink with stock text; existing is dashed; resolved is `good-ink` outline on transparent.

### Cards / Containers

- **Corner Style:** 3px for panels, lists and tables; 2px for the catalog card.
- **Background:** `stock` on `ground`.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `rule`; rows inside separated by `rule-soft`.
- **Internal Padding:** 16px panels; 10px 14px list items; 7px 12px table cells.

### Inputs / Fields

- **Style:** 32px, `rule-strong` border, `stock` face, 3px corners, 14px sans; placeholders in `ink-3`; labels 12px `ink-2` above.
- **Focus:** the global 2px `accent` outline. Hover darkens the border to `ink-3`.
- **Checkboxes** take `accent` as accent colour; segmented controls are joined with `rule-strong` dividers and an `accent-wash` pressed segment.

### Navigation

- **Rail:** oak, `rail-ink` lettering, items 8px 10px with 3px corners and a 16px icon. Hover shows the open-drawer face (`rail-2`).
- **Active:** the open drawer: `rail-2` face, weight 600, plus a 1px inset `rail-ink-2` hairline. Not red.
- **Theme switch:** a three-way System / Light / Dark fieldset at the foot of the rail; the checked option takes the open-drawer face and a `rail-ink-2` border.
- **Mobile:** below 860px the rail is a drawer behind a menu button.

### Catalog Card (signature)

Selecting a module anywhere pulls its card. The card is `stock` with a 1px `rule` border and 2px corners. Its header (14px 16px 12px) holds the call, a path in Title weight and mono, then meta tags and actions, and closes with the 2px `index-red` rule. Sections (12px 16px) are separated by `rule-soft`, each opening with a card section label and a count pill; cross-references list paths with right-aligned mono `line:column` refs. Import chains draw as a vertical `rule-strong` line with small ringed nodes. The card heading takes focus when the card opens, without a focus ring.

### Dependency Graph (signature)

- **Fill** is the layer colour (`layer-none` for unclassified); external packages are `graph-package` diamonds; folders are rounded rectangles.
- **Ring:** 1px `graph-node-ring` by default; a 3px `critical` or `warning` ring marks the source of a violation; the selected node takes a 3px `accent` ring.
- **Size** is direct degree: `min(64, 18 + 7 * sqrt(degree))` px.
- **Edges:** 1.25px `graph-edge` with arrows; dashed (5/4) for type-only imports, dotted `graph-package` to external packages, 2px `cycle` inside a cycle, 2.5px `critical` for a violation.
- **Focus** dims everything outside the selection's reach to 12% opacity; lit edges go to 3px.
- **Tooltip:** solid ink with stock text in 12px mono, no border, no shadow.

### Icons

One family: 24px grid, 1.75 stroke, round caps and joins, `currentColor`, inline SVG. Disclosure markers are drawn from this family and rotate 180deg when open; the browser triangle is hidden.

## Do's and Don'ts

### Do:

- **Do** draw every boundary with a 1px hairline: `rule` around containers, `rule-soft` between rows, `rule-strong` around controls and overlays.
- **Do** reserve `index-red` for the 2px rule under the pulled catalog card's header.
- **Do** show the active nav item as the open drawer: `rail-2` face plus a 1px inset `rail-ink-2` hairline.
- **Do** letter paths as call numbers: folder in `ink-3`, file name in ink, wrapping only after "/".
- **Do** set paths, fingerprints, rule IDs and import kinds in `ui-monospace`, and everything else in the system sans.
- **Do** pair every error and warning colour with an icon and a text label.
- **Do** assign layer colours in the validated order and send the ninth layer onward to `layer-none`.
- **Do** use tabular figures for every count and numeric column.
- **Do** keep transitions to 150-200ms ease-out on colour and transform, and honour reduced motion.

### Don't:

- **Don't** use drop shadows, floating cards or raised tiles; overlays separate with a `rule-strong` border.
- **Don't** use red for navigation, selection or emphasis; selection is `accent-wash`.
- **Don't** cycle layer hues or invent a ninth hue.
- **Don't** use `cycle` magenta for anything but edges inside a cycle.
- **Don't** set the wordmark, headings or prose in monospace.
- **Don't** build a dark KPI-tile wall or a glowing graph; counts live in the ruled ledger.
