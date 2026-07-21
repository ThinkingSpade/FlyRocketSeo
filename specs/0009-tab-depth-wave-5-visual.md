# 0009 — Depth wave 5: Semrush visual language + positioning map

## Motivation

Waves 3–4 added analysis and density; feedback now is the _look_: Semrush
pages feel alive — colored intent chips, per-row trend sparklines, tinted
stat tiles with icons — while ours read as plain gray cards. This wave adds
that visual layer plus one flagship Semrush visual we're missing entirely
(the competitive positioning map).

Rules carried forward: client-side over already-fetched data wherever
possible; daisyUI theme tokens only (subtle tints, dark-mode safe), no new
design system.

## Features

### 1. Keyword Research — per-row trend sparklines

The signature Keyword Magic column. Every result row already carries 12
months of `trend` data (rendered today only for the selected keyword). Add
a Trend column: a hand-rolled SVG sparkline (polyline + soft gradient fill,
~1.5rem tall) — no recharts in the table hot path. Rows without trend data
show a muted dash.

### 2. Shared `InsightTile` — tinted stat tiles with icons

One shared tile component: lucide icon in a soft tinted rounded square,
uppercase label, big tabular value, optional hint; tones map to theme
colors (primary/success/warning/error/info/neutral). Replaces the plain
stat tiles on: SERP Overview (keyword stats + strength row), Page Explorer
(8 tiles), Local Rank Grid (Share-of-Voice row), Local SEO (review tiles).

### 3. Competitors — competitive positioning map

Semrush's Organic Research staple: a bubble scatter of the competitive
landscape. X = organic keywords, Y = organic traffic, bubble size = shared
keywords, one bubble per listed competitor (top 8 by overlap), plus the
target domain's own bubble (via the cached `getDomainOverview`) in primary
color. Recharts ScatterChart in a card above the competitors table;
tooltip shows domain + all three metrics.

### 4. Card-header icons across waves 3–4 surfaces

Small muted-tinted icons on the analysis cards: Map leaders (trophy),
traffic concentration (zap), striking distance (crosshair), seasonal
heatmap (calendar), momentum (activity), rating distribution (star),
review velocity (trending-up), needs-a-response (alert), People-also-ask
(help), on-page snapshot (file).

## Non-goals

- No bespoke colors outside daisyUI tokens; no theme overhaul.
- GSC branded/non-branded split deferred to a later wave.

## Testing

Sparkline path-building is a pure helper with vitest coverage; the rest is
presentational (verified live). Standard gates: prettier (changed files),
knip, tsc, oxlint, vitest.
