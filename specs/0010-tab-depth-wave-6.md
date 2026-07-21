# 0010 — Depth wave 6: branded split, gap overview, backlinks timeline

## Motivation

Continues the depth program with the three items queued after wave 5. Two
are free cuts of data we already hold; one spends a little metered budget
where the value is obvious. All reuse the wave-5 InsightTile language.

## Features

### 1. GSC Insights — branded vs non-branded (free)

The report call already fetches 1,000 query×page rows. The server now also
returns `queryTotals` (per-query clicks/impressions, top 500 by clicks).
The client classifies queries against editable brand terms (prefilled from
the domain stem, e.g. `deliotx`) — a pure, unit-tested matcher — and shows:
branded share of clicks, branded vs non-branded clicks/queries tiles, and
a split bar. Editing terms recomputes instantly, no refetch.

### 2. Competitors — keyword-gap overview strip (small metered cost)

Semrush's gap tool leads with the category counts. When a target +
competitor pair is set on the Keyword Gap tab, fire all three gap modes
(missing / shared / advantage) at the table's own page size — the active
mode is already being fetched, so this adds at most two Labs calls per new
pair, then server-cached. Render three clickable InsightTiles with the
total counts; clicking switches the table mode (which then hits cache).

### 3. Backlinks — new/lost referring-domains timeline (small metered cost)

`dataforseo.backlinks.history` is already wired and metered but unused.
New `getBacklinksTimeline` server function: last 12 months, monthly points
(date, new/lost referring domains, cumulative referring domains, new/lost
backlinks), R2-cached for a day per target. The Backlinks tab gets a
timeline card between the overview panels and the results table: green
bars up (won domains), red bars down (lost), cumulative line on a second
axis.

## Non-goals

- No changes to gap table pagination or backlinks tab structure.
- Branded classification stays client-side and heuristic (substring on
  normalized tokens); no persistence of custom brand terms yet.

## Testing

Pure helpers (query aggregation, branded classifier, timeline mapping) get
vitest coverage; standard gates before deploy.
