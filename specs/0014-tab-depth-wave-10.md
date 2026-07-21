# 0014 — Depth wave 10: project-aware tabs (your keywords, one-click analyze)

## Motivation

Repeated feedback that the app still "looks boring and lacking depth" next
to Semrush/Ubersuggest, even after waves 3–9 added analysis to every tab.
Diagnosis: the added depth is real but almost never _on screen_, because
the tabs are tool-shaped rather than project-shaped.

The project knows its domain (deliotx.com), yet:

- Domain Overview defaults to `domain: ""` and shows recent searches.
- Backlinks shows "Enter a domain or URL to get started".
- Competitors prefills the input but never runs.
- Local SEO / Local Rank Grid ask for input too.

So the first screen of most tabs is an empty form. Semrush and Ubersuggest
feel dense because they are project-centric: set the domain once, every
screen arrives populated. That's the gap — not card count.

Decisions taken with the user:

- **No auto-spend.** Metered tabs get a prominent one-click prompt, not an
  automatic call.
- **Free data should arrive automatically.** GSC is first-party and free
  (the dashboard already auto-loads it), so the keywords the site ranks
  for can and should be on screen with no action.

## Features

### 1. Per-query positions in the GSC report (free)

`getSearchPerformanceReport` already fetches 1,000 query×page rows and
derives striking distance, CTR opportunities, and query totals from them.
`buildQueryTotals` now also returns each query's **best position** across
its pages (min position; ties break on impressions) — no new API call,
purely more value from rows already in hand. Additive field, so the
branded-split consumer is unaffected.

### 2. Overview dashboard — "Your keywords" card

The centerpiece, answering "keywords you currently rank for" and
"keywords we could be targeting" directly, from the report the dashboard
already loads:

- Tiles: ranking queries, top 3, top 10, close to page 1 (positions 4–20).
- **Ranking now** — top queries by clicks with position, clicks,
  impressions.
- **Could be targeting** — positions 4–20 ranked by impressions: real
  demand where the site is already visible but not winning.
- Both lists link into GSC Insights for the full tables.

Renders only when GSC is connected; otherwise the existing connect card
covers it.

### 3. One-click "Analyze <domain>" prompts

Shared `AnalyzeDomainPrompt`: headline naming the project domain, a
primary button that runs that tab's analysis for it, and a preview row of
what the tab returns. Placed on the empty states of Domain Overview,
Backlinks, and Competitors. Nothing is fetched until the click, so the
zero-auto-cost rule holds.

## Non-goals

- No automatic metered calls anywhere (explicit user decision).
- No Ubersuggest rank-tracking import this wave.
- No new nav items; everything lands on existing surfaces.

## Testing

`buildQueryTotals` position derivation and the keyword-bucket selectors
are unit-tested; standard gates; live verification on deliotx.com, which
has GSC connected.
