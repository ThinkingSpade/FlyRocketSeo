# 0012 — Depth wave 8: visibility trend, cannibalization severity, pages treemap

## Motivation

Continues the depth program. All three features are pure client-side cuts
of responses the tabs already fetch — zero new DataForSEO spend — and all
follow the wave-7 visual rules (bare muted icons, native tiles, no chips).

## Features

### 1. Rank Tracking — visibility trend ("share of voice over time")

The scorecards already compute a volume×CTR-weighted visibility score for
the latest run; the history matrix already loads per-run positions for
every tracked keyword. Combine them: a pure helper replays the visibility
formula across every run in the matrix (volumes from the loaded results
rows) and a line chart above the "By date" matrix shows visibility %
per check, with the net change called out in the header. Only rendered
when ≥2 runs and some keyword volume exist.

### 2. Cannibalization — severity scoring

Rows already carry per-page clicks/impressions/position and the query
totals. A pure helper scores each row: how evenly clicks split across
competing pages (1 − winner share, falling back to impressions when there
are no clicks) scaled by the query's impressions — then maps scores to
High / Medium / Low severity. The table gains a severity badge column and
sorts by severity so the worst splits lead.

### 3. Domain Overview — top-pages treemap

The Pages tab already fetches per-page organic traffic. A treemap card
above the table shows the first page of results sized by traffic (top 11
plus an "other" bucket), using the shared chart palette. Reads instantly:
which few URLs carry the domain.

## Non-goals

- Audit issue deltas (still blocked on issue counts in history rows).
- No new endpoints, schema changes, or metered calls.

## Testing

Pure helpers (`visibilityTrend`, `cannibalizationSeverity`, treemap data
builder) unit-tested; standard gates; live verify on production.
