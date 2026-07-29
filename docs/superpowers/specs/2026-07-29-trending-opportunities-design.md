# Trending opportunities on the Keyword Trends tab

**Date:** 2026-07-29
**Status:** Implemented (`beb521f`), with the corrections below.

## Corrections made during implementation

A Codex review of this design found twelve issues before any of it shipped.
The ones that changed the design are recorded here rather than silently fixed,
because each is a way the feature would have produced a confident wrong number.

1. **Both period fetches must use the same GSC dimension set.** The design
   proposed `["query"]` for the prior period while current data came from
   `["query", "page"]`. Google aggregates impressions per dimension set —
   query-only counts one impression per property appearance, query x page one
   per URL — so a two-page query would have looked like it doubled with
   nothing changed. Page attribution now comes from a separate call whose
   counts never cross a period boundary.
2. **Position must not be a minimum across pages.** Summing impressions across
   pages while keeping the best position reports "1,005 impressions at
   position 2" when 1,000 of them sit at 15. The list now uses GSC's own
   property-level average position, and names the page by impression _share_.
3. **Absence from the prior period cannot mean "new".** GSC sorts rows by
   clicks, does not guarantee every row even below the row limit, and
   withholds anonymised queries. `emerging` was removed entirely in favour of
   `no-baseline`, which claims only that no comparison exists.
4. **Impressions are not demand.** An impression means this property's result
   was shown, so the number moves when rankings move. Every label says
   "impressions"; none says "demand" or "interest".
5. **Falling impressions must not mean "skip".** A ranking or indexing loss
   looks exactly like falling impressions and is the most valuable case on the
   page, not the least. It became "find out what changed" — which also
   resolves a direct contradiction with the Opportunities tab, which calls the
   same declining position-8 query a quick win.
6. **Position 21+ means rebuild, not write a new page.** A page of theirs
   already ranks; a second one invites self-competition.
7. **Generated seeds were dropped from this list.** They have no impressions,
   so they cannot be ranked by impressions at stake — the design promised
   something the data cannot support. The list is GSC-derived only.
8. **The fit guarantee is conditional.** With no saved profile the classifier
   returns no verdicts and nothing is filtered. That is stated rather than
   promised away.

Also corrected: the momentum formula below omitted `x 100`, and the two
`skip`/`emerging` matrix rows described states rather than actions.

## Problem

Keyword Trends answers a question nobody asked. It takes up to five keywords,
charts their Google Trends interest side by side, and stops. It cannot tell you
which keywords to target, and it has no opinion about what to do next.

The user's words: _"not giving me a list of trending keywords that I should be
targeting... provide suggestions and what to do like fix current page, add more
information, add another page."_

## The finding that reframes it

**Google Trends cannot see this client's keywords.** Measured against the live
API for deliotx.com's own Search Console queries:

| Keyword                   | Trends avg interest |
| ------------------------- | ------------------- |
| `delio`                   | 54                  |
| `dfw vending`             | 2                   |
| `breakroom services`      | 1                   |
| `dallas vending services` | 0                   |
| `dallas healthy vending`  | 0                   |

A second batch confirmed the shape: `micro market` 45, `office coffee service`
8, and `vending services dallas` / `breakroom services` / `dfw vending` at 0.

Google Trends thresholds out low-volume terms, and a local B2B service business
lives entirely below that threshold. The single non-zero result is worse than
the zeros: `delio` scores 54 because it matches unrelated global brands, not
this client's demand. Building "trending keywords to target" on Trends would
hand a local operator a list of zeros plus one misleading number.

Two further Trends properties constrain any design here:

- **The five-keyword cap is Google's**, not a UI choice
  (`MAX_TRENDS_KEYWORDS`), because interest is computed _relative to the
  comparison set_.
- **Interest is therefore not comparable across batches.** Batch A's 80 and
  batch B's 80 mean different things. Only each keyword's change against its
  own history — momentum, YoY, seasonality — survives batching, which is
  exactly what `trendsInsights.ts` already computes.

**The trend signal that does exist is Search Console.** Impressions per query,
this period vs last: free, unmetered, specific to this site, and it covers
precisely the keywords Trends returns 0 for. `getSearchPerformanceReport`
already fetches a previous period — but only by `date`, for totals. Per-query
prior impressions are one extra free GSC call away.

## Approach

Keep the comparison chart; put a ranked action list above it. Demote Google
Trends from the centre of the tab to a seasonality sidecar.

Rejected alternatives:

- **Keep Trends central and accept the zeros.** Honest about the provider,
  useless to the user, and the one non-zero row actively misleads.
- **Metered discovery via Labs `top_searches`.** Buys a category list nobody
  asked for; the client's own impression data is both free and more relevant.
- **Fold this into the Opportunities tab.** That tab ranks by clicks at stake
  _today_ and cannot see a topic the site has no page for. This adds the time
  axis and the no-page case; overlapping rows are fine because the two tabs
  answer "what is worth most now" and "where is demand going".

## Candidate sources

All three are cheap and already exist:

1. **GSC queries, current + previous period.** One added free call
   (`dimensions: ["query"]` over the prior window). Gives real per-keyword
   momentum for everything the site ranks for.
2. **Profile-generated seeds** (`generateSeedKeywords`, one model call). The
   only source that can surface a topic the client has **no page for**.
3. **Saved keywords** (free, D1).

Every candidate passes through the existing keyword-fit classifier
(`src/shared/keyword-fit`) before it can be recommended, so the tab never tells
deliotx to write a page for `vending machines for sale`.

## Momentum

Pure, unit-testable, no I/O:

- `momentumPercent` = (impressions − prevImpressions) / prevImpressions
- `rising` / `flat` / `falling` with a dead band, because small absolute
  impression counts swing wildly in percentage terms
- **`emerging`** when there is no prior-period row at all — genuinely new
  demand, which is different from "fell to zero" and must not be reported as
  +∞%
- A **minimum impression floor**, below which no verdict is issued. Three
  impressions becoming six is not a 100% rise, and presenting it as one is the
  fastest way to lose a user's trust in the whole tab.

## Action matrix

Position × momentum × has-page → one action, each with a reason:

| Where they rank | Demand   | Action               |
| --------------- | -------- | -------------------- |
| 1–3             | rising   | **Defend it**        |
| 4–10            | rising   | **Fix this page**    |
| 11–20           | rising   | **Expand it**        |
| 21+             | rising   | **Write a new page** |
| no page at all  | —        | **Write a new page** |
| any             | falling  | **Skip**             |
| any             | emerging | **Emerging**         |

Ranked by impressions at stake, weighted by momentum, so a rising keyword with
real volume outranks a rising keyword with three impressions.

Each row links to the tab that does the work — Content Optimizer for
fix/expand, Keyword Research to validate a new topic — the same handoff pattern
the Phase 4 action plan uses, and for the same reason: the panel must not fire
metered calls of its own.

## Trends' remaining role

Seasonality for head terms that actually have data. A row whose keyword returns
no Trends data says so plainly rather than rendering a flat zero line as
though it were a finding. This answers _when to publish_, never _what to
target_.

Still opt-in and metered: **$0.011 per five-keyword call**, measured.

## Testing

Unit tests for both pure modules: momentum (including the emerging case, the
impression floor, and zero/absent prior values) and the action matrix (every
cell, plus fit-filtered candidates never appearing). A regression test that the
ranked list issues no metered call on mount — the failure mode that leaks
money.

`npm run ci:check` and `npm test` gate each commit.
