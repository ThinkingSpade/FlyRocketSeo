# 0013 — Depth wave 9: rank-tracking dashboard parity + useful empty states

## Motivation

Side-by-side feedback: Ubersuggest's Rank Tracking greets you with movers
("13 moved up / 6 down / 6 unchanged"), an average-position trend with its
delta headline (22.72 → 20.17, +2.55), and a current-rankings breakdown
with previous→current transitions — while our tabs still open sparse, and
Content Optimizer's empty state is a blank dashed box. Wave 9 closes the
called-out gaps. All additions are client-side over data the views already
fetch — zero new API spend, native visual language.

## Features

### 1. Rank Tracking — scoreboard row (movers + visibility)

The scorecards helper already computes visibility/improved/declined but is
only used on the small dashboard card — the domain detail never shows it.
Add `unchanged` to the helper and render a tile row above the position
distribution: Visibility %, Moved up, Moved down, Unchanged — the
Ubersuggest header, computed from the loaded rows' current vs previous
positions.

### 2. Rank Tracking — current rankings transitions

New pure helper buckets each keyword's previous and current position into
Top 3 / Top 10 / Top 20 / Not ranking and reports `previous → current`
per bucket (Ubersuggest's donut legend, minus the donut). Rendered as a
compact card beside the scoreboard.

### 3. Rank Tracking — average position trend

From the already-loaded history matrix: average position across ranked
keywords per run, drawn with a reversed Y axis (up = better) and the
first→latest delta in the header. Sits in a two-column grid with the
existing position-distribution chart; the wave-8 visibility trend stays in
the "By date" view.

### 4. Content Optimizer — useful empty state

Replace the blank dashed box with: recent briefs (new localStorage history
on the shared store, recorded when a brief loads; chips relink with one
click) and a "what you'll get" preview row (target length, structure,
terms, questions — muted native tiles), so the tab shows its value before
the first keyword.

## Non-goals

- No auto-created tracking configs or checks (the user decides when to
  track; costs are recurring).
- Audit issue deltas remain parked on the schema gap.

## Testing

Pure helpers (`unchanged` in scorecards, bucket transitions, average
position trend) unit-tested; standard gates; live verify what has data.
