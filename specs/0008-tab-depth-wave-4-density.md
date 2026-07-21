# 0008 — Depth wave 4: Semrush-grade density

## Motivation

Feedback after wave 3: tabs still feel sparse next to Semrush, where "there
is barely any whitespace". Two root causes:

1. **Layout**: research pages cap content at `max-w-6xl` (1152px) and stack
   one card per row, so a 1500px+ desktop shows dead margins and a single
   thin column.
2. **Analysis stops early**: pages show the fetched list but skip the
   second-order cuts (distributions, concentrations, callouts) Semrush
   surrounds every table with.

Same hard rule as wave 3: every addition is computed client-side from data
the tab already fetches — zero new DataForSEO spend.

## Features

### 1. Page Explorer — from "a table" to a dashboard

Existing data: up to 100 ranked keywords (position, volume, traffic, CPC,
KD), totals, backlink summary, on-page snapshot.

- Second stat row: #1 rankings, top-3, top-10, striking distance (4–15).
- Ranking distribution stacked bar (reuses the Domain Overview
  `PositionDistribution` component).
- Traffic concentration: top-5 keywords' share of estimated traffic with
  bars and a "top 5 drive X%" line.
- Striking-distance list: positions 4–15 by volume — the push-these list.
- Two-column desktop layout (keywords table left; distribution,
  concentration, striking distance, snapshot right) at `max-w-screen-2xl`.

### 2. Local SEO — review analytics above the raw list

Existing data: crawled reviews (rating, timestamp, text, owner answer).

- Tiles: crawled average, response rate, unanswered negatives, last-90-days
  count.
- Rating distribution 5→1 bars.
- Review velocity: per-month counts for the trailing 12 months (CSS bars).
- "Needs response": negative (≤3★) unanswered reviews, newest first.

### 3. SERP Overview — SERP strength summary

Existing data: top-20 results with DR (Ahrefs) and domain traffic.

- Tiles: average DR of the top 10, median domain traffic, soft spots
  (top-10 results with DR < 30), plus a "weakest slot" callout naming the
  lowest-DR top-10 page — the displacement target.

### 4. Keyword Trends — seasonal heatmap

Keyword × calendar-month grid of average interest (0–100 → color
intensity), under the momentum table. Reads the series already charted.

### 5. Density pass on layout

Trends, SERP Overview, Topic Clusters, Local Rank Grid, Local SEO, and Page
Explorer widen from `max-w-6xl` to `max-w-screen-2xl`; secondary cards move
into 2-column grids on xl so tall single columns stop stacking whitespace.

## Non-goals

- Competitors keyword-gap totals (needs one metered call per gap mode);
  revisit when a cheap intersection summary exists.
- No visual redesign of shared components — only layout composition and new
  cards in the tabs above.

## Testing

Pure helpers (`pageInsights`, `reviewAnalytics`, `serpStrength`, monthly
matrix in `trendsInsights`) get vitest coverage; lint/knip/tsc/vitest gate
the commit.
