# 0007 — Tab depth wave 3: Keyword Magic groups, map Share of Voice, SERP traffic share

## Motivation

Several tabs answer their headline question but stop there, while the
reference tools (Semrush, Ahrefs, Ubersuggest) layer one or two more
analytical cuts onto the same data. This wave adds those cuts **without any
new DataForSEO spend** — every feature below is computed client-side from
responses the tabs already fetch, matching the pattern of depth waves 1–2.

## Features

### 1. Keyword Research — Keyword Magic-style groups rail + totals bar

Semrush's Keyword Magic Tool shows a left rail of sub-terms ("tx 26",
"machine 19", "coffee 6") that slice the result list, plus a totals bar
("All keywords: 72 · Total Volume: 2,700 · Average KD: 28%").

- **Groups rail** (desktop, xl+): tokenize all loaded rows, drop seed-query
  terms and a minimal stopword list, aggregate per term (keyword count +
  summed volume). Toggles: "By number" / "By volume". Clicking a group
  filters the table to keywords containing that term; clicking again clears
  it. Implemented as a `groupTerm` field beside the existing filters so
  exports, pagination, counts, and the mobile list all stay consistent.
  Group term resets on a new search and via "Clear all".
- **Totals bar**: `N keywords · Total volume X · Avg KD Y` computed over the
  currently filtered rows, shown in the table header strip.
- Fix in passing: `resetFilters` misses the `questionsOnly` key added in the
  last wave, so "Clear all" leaves the Questions toggle stuck on.

### 2. Local Rank Grid — Share of Voice + map leaderboard

Semrush's Map Rank Tracker headlines Avg Rank and Share of Voice. The grid
cells already return `topCompetitors` (top-3 business names per pin) and our
own `position` per pin.

- **Share of Voice card**: % of scanned pins where the project ranks top-3,
  plus average rank (already computed) restyled into a stat row.
- **Map leaders card**: aggregate `topCompetitors` across pins → businesses
  ranked by top-3 appearances with a coverage bar (appearances / scanned
  pins). Answers "who owns this map" at a glance.

### 3. SERP Overview — estimated traffic share per result (Ahrefs-style)

Ahrefs' SERP overview shows estimated traffic per ranking URL. We already
have keyword volume and each result's position: estimated clicks/mo =
volume × standard organic CTR curve by position, with a % share bar. Clearly
labeled as an estimate; column omitted when volume is unavailable.

### 4. Keyword Trends — momentum & seasonality table

The tab charts interest but forces eyeballing. Under the chart, per keyword:
latest interest, 90-day momentum vs the prior 90 days (Rising / Stable /
Falling badge with %), year-over-year change when the series spans a year,
and peak / low months (seasonality). All from the fetched series.

### 5. Topic Clusters — priority ranking + totals + Copy for AI

- **Header chips**: cluster count, summed volume, avg KD across the plan.
- **Priority badges**: clusters ranked by opportunity (volume weighted
  against KD) → P1/P2/P3, so the plan reads as a roadmap, not a list.
- **Copy plan for AI**: the whole hub-and-spoke plan as markdown on the
  clipboard, mirroring the keyword table's "Copy for AI".

## Non-goals

- No new metered API calls; no schema/server changes except pure client code
  (the SERP CTR curve and grid aggregation are client-side pure functions).
- No new tabs or nav items — depth goes into existing surfaces (user
  preference established in earlier waves).
- Semrush features that need data we don't buy (historical SERP volatility,
  clickstream-based intent refinement) stay out.

## Testing

Pure helpers (group extraction, CTR share, momentum stats, grid leaderboard
aggregation) get vitest coverage beside existing unit tests; `ci:check`
(prettier, knip, tsc, oxlint) gates the commit as usual.
