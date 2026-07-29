# Smart Keyword Research

**Date:** 2026-07-29
**Status:** Approved design, ready for planning

## Problem

Keyword Research is tool-shaped, not client-shaped. You type a string, it
returns strings that resemble it. Four distinct failures, observed on a real
project (deliotx.com, a DFW vending _operator_ — they place and service
machines in offices; they do not sell machines).

**1. It has no idea what the client sells.** A project is `name`, `domain`,
`locationCode`, `languageCode` and its target areas
(`src/db/pg/app.schema.ts:57`). Nothing describes the offer, the buyer, or —
decisively — what the business is _not_. Expansion is string-similarity via
DataForSEO Labs, so `dfw vending` returns everything containing those tokens,
including `vending machines for sale dfw`. That keyword belongs to a
_competitor's_ customer: someone who wants to buy a machine, not someone who
wants one placed in their breakroom. The tool cannot tell the difference, so it
recommends the client chase demand they cannot serve.

The existing suggestion engine (`src/client/features/insights/suggestionModel.ts`)
is real but backward-looking: striking distance, under-clicked, topic gaps —
every candidate is a query the site _already earns impressions for_. It can
never propose a topic the client has never ranked for, which is exactly what a
new client needs.

**2. The geography control is duplicated, and the wrong one is prominent.**
The Keyword Research header carries a `ScopeControl`
(`src/client/features/geo/ScopeControl.tsx`) whose picker supports metros,
states, cities and countries. The search form carries a _second_, country-only
`LocationSelect` sitting next to the Search button — the one users actually
reach for. Result: a DFW project looks nationally scoped and un-targetable.

Two prior defects compounded this and are now fixed but were live until
recently: the picker's `LIKE` matching shipped with a malformed `ESCAPE` clause
and returned zero results for every query (`34e8ddb`), and its ordering keyed
off a `population` column that is never populated (`c237218`).

**3. SERP analysis is gated with no visible gate.** `useKeywordSerpAnalysis`
(`src/client/features/keywords/hooks/useKeywordSerpAnalysis.ts:17`) runs behind
`useAuthorizedRun`. With nothing authorized the panel renders "No SERP details
available for this keyword yet. Try clicking another keyword to load data." —
and there is no button anywhere that authorizes a run. A dead end presented as
a data gap.

**4. There is no ranking guidance.** Nothing anywhere answers "what would it
take to rank for this?"

## Verified facts this design rests on

Established against production D1 and the live schema, not assumed:

- `geo_locations` **is seeded**: 62,745 rows — 210 `DMA Region`, 19,654 `City`,
  plus counties, neighborhoods, postal codes.
- `Dallas-Ft. Worth, TX` = **200623** (`DMA Region`). `Miami, Florida` =
  **1015116** (`City`). `Dallas, Texas` = **1026339** (`City`).
- `population` is NULL for **all 62,745 rows** — any ordering that keys off it
  is a no-op.
- `src/shared/geo/resolveGeo.ts:41` marks `keyword-difficulty`, `search-intent`
  and `domain-analytics` as `NATIONAL_ONLY`. DataForSEO Labs is their sole
  source and is country-level only.
- `US_DMAS` in `src/client/features/geo/usDmas.ts` is an empty array; metro
  rows reach the picker through the seeded D1 search, not that table.

### Known-wrong fixture

`resolveGeo.test.ts` and `scripts/verify-geo-support.ts` use `1026339` labelled
"Dallas-Fort Worth TX". That code is the **City of Dallas**; the DFW DMA is
`200623`. Harmless where it only exercises branching, but it is a false label
in the repo and gets corrected in Phase 0.

## Constraints that shape the design

**Difficulty and intent are permanently national.** Not a bug and not fixable.
A DFW-scoped project reads volume, CPC, trends, SERP and rank tracking locally
(Google Ads / SERP APIs, metro code) and difficulty/intent nationally (Labs).
Every figure must say which it is rather than implying uniform local scope.

**The keyword _idea list_ is also national.** Related/suggestions/ideas are Labs
endpoints. A DFW project gets a national candidate list with DFW volumes
attached. Locally-specific candidates can only come from generation (Phase 2),
not from expansion.

**No auto-spend.** Nothing metered may fire from a render, a route load, or a
restore. Metered work happens on an explicit click, always. Sibling components
in the subtree must be checked for self-fetching `useQuery` calls before
anything renders from a restored run.

**`OPENROUTER_API_KEY` is currently unset.** Phase 2 depends on it. Phases 0,
1, 3 and 4's free tier do not. Phase 1 must therefore stand alone and stay
useful if the key is never set.

**Cloudflare free-plan CPU limit.** The audit crawl exceeded it with cheerio
plus large batches. Any crawl added here is capped at ~5 pages.

## Approach

Business semantics become a first-class project record; everything else reads
from it. Rejected alternatives:

- **Infer the business per-request from the domain.** No stable record to edit
  or correct, an LLM call on every run, and the user can never fix a wrong
  inference. The whole value is that a human confirms it once.
- **A second geography store on the profile.** `project_target_areas` already
  is the geography source of truth with a confirm/propose lifecycle. A parallel
  store guarantees drift. The profile carries _shape_ (`serviceAreaKind`), not
  coordinates.
- **Hide wrong-fit keywords.** Silently dropping results is how a tool loses
  trust, and a wrong-fit keyword is sometimes a deliberate content play. Flag
  and demote; never hide.
- **One LLM call per keyword for fit.** Cost scales with result-set size for no
  extra accuracy. Batch the whole run into one call and cache by keyword.

## Data model

New table `project_profiles`, one row per project, on **both** D1 and Postgres
schemas (`src/db/schema.ts`, `src/db/pg/app.schema.ts`) with a migration on
each. Schema parity is asserted by `schema-parity.test.ts`.

| Column              | Type                       | Purpose                                   |
| ------------------- | -------------------------- | ----------------------------------------- |
| `id`                | text PK                    |                                           |
| `project_id`        | text FK → projects, unique | one profile per project                   |
| `offer`             | text                       | what they sell                            |
| `customer`          | text                       | who buys it                               |
| `exclusions`        | text                       | what they explicitly do NOT do            |
| `brand_terms`       | json                       | names treated as branded                  |
| `service_area_kind` | text enum                  | `local \| regional \| national \| global` |
| `source`            | text enum                  | `ai \| manual`                            |
| `drafted_at`        | timestamp                  | nullable                                  |
| `confirmed_at`      | timestamp                  | nullable — NULL means unconfirmed draft   |
| `created_at`        | timestamp                  |                                           |

`confirmed_at` mirrors the propose/confirm lifecycle `project_target_areas`
already uses: an AI draft is a proposal until a human accepts it.

`service_area_kind` is the field that answers "sometimes a client targets the
whole US, or the world, or just Miami". It drives expansion behaviour:
`local`/`regional` append geo modifiers drawn from the project's confirmed
target areas; `national`/`global` strip them as noise.

New table `keyword_fit_verdicts` caches per-keyword classification:
`project_id`, `keyword`, `verdict`, `reason`, `source` (`rules | ai`),
`created_at`, unique on (`project_id`, `keyword`).

## Phase 0 — Geo consolidation

Replace `LocationSelect` in `KeywordResearchSearchBar.tsx` with
`GeoLocationSelect`. The form's `locationCode` field becomes derived: country =
`area.parentCountryCode`, area = the selected row. This funnels through the
existing `resolveRunGeo` reconciliation rather than adding a second path.

Correct the `1026339` fixture to `200623` where it is labelled as the DMA.

### Two items dropped on contact with the code

**No "Worldwide" option.** The approved roadmap promised one. It cannot be
built honestly: both Labs and the Google Ads endpoints require a country
`location_code`, and `TargetArea` has no representation for "everywhere". A
global client still has to research one market at a time, so a Worldwide row
would either silently mean "United States" or fail every request. Global
service area is captured instead as `service_area_kind: global` on the Phase 1
profile, where it does real work — stripping geo modifiers out of generated
seeds. (Keyword _Trends_ genuinely has a worldwide mode; that is Google Trends,
a different provider with a different contract.)

**Per-metric scope labels already exist.** `KeywordResearchDesktopTable.tsx:88`
already calls `formatGeoMetricLabel("Volume", researchGeo.volume)` and the same
for CPC, Score and Intent. The headers render bare in the screenshot that
prompted this work because that run was restored from before geo bundles were
persisted, so `researchGeo` is null — correct behaviour, not a missing feature.
Nothing to build.

**Done when:** a DFW project can be scoped from the search form itself, and no
screen shows two competing location controls.

## Phase 1 — Business profile + deterministic fit filter

Migration and repository for `project_profiles`. An editable profile form
reachable from project settings and from an inline prompt on Keyword Research
when no profile exists.

Fit classification with **zero new dependencies**: tokenize `exclusions` into
negative terms and match against each result keyword. `exclusions: "we don't
sell machines"` yields `for sale`, `buy`, `sell` → `vending machines for sale
dfw` is flagged `wrong-customer` with the reason _"you don't sell machines"_.

Results table gains a fit column and a `Hide wrong-fit (n)` filter chip,
default off. Default sort demotes `wrong-customer` below `on-offer`.

**Done when:** with a profile saved for deliotx, `vending machines for sale
dfw` is visibly flagged and demoted, with no API key set and no metered call.

## Phase 2 — Auto-draft + semantic layer

`draftProjectProfile(projectId)` server function:

1. Free cheerio crawl of the homepage plus up to 4 internal pages (hard cap —
   CPU limit).
2. Top GSC queries (free, already cached).
3. GBP primary category when connected (free).
4. One OpenRouter call returning zod-validated JSON.

Returns a **draft**, never persisted directly. The user confirms or edits it in
the Phase 1 form, setting `confirmed_at`.

Profile-driven seed generation produces candidates expansion cannot reach —
`office coffee service dallas`, `breakroom micro market fort worth` — honoring
`service_area_kind` for whether geo modifiers are appended at all. Generated
seeds are unvalidated candidates: they carry no volume until the user runs them
through the (metered) expansion, on an explicit click.

Batched LLM fit refinement: one call classifying a whole result set against the
profile, written to `keyword_fit_verdicts` so re-opens are free. Rules-based
verdicts from Phase 1 remain the fallback.

Every AI affordance degrades to disabled-with-a-reason when
`OPENROUTER_API_KEY` is unset. Nothing in Phase 1 stops working.

**Done when:** the draft button produces an editable profile from deliotx.com
alone, and generated seeds include DFW service terms absent from any expansion.

## Phase 3 — SERP trigger

Replace `SerpAnalysisEmptyState` with an explicit _Analyze SERP for "keyword"_
button calling the existing `selectSerpKeyword` authorize path. Distinguish the
three states the current copy conflates: no keyword chosen, keyword chosen but
unauthorized, and authorized-but-empty.

**Done when:** SERP results load from a click, and no state renders a dead end.

## Phase 4 — Per-keyword action plan

A panel keyed to one keyword, assembled in cost tiers.

_Free, renders immediately:_ who ranks (top 10 with page type, DR, depth from a
capped fetch of the top 3), a winnable/stretch/no verdict against the client's
own DR, internal-link candidates from GSC pages already ranking for related
queries.

_Metered, explicit click each:_ off-page link targets from competitors'
referring domains; local-pack presence and GBP/citation actions when
`service_area_kind` is `local` (the `local-pack` need already resolves to a
metro in `resolveGeo`).

Content outline and entity gaps derive from the SERP data Phase 3 fetched plus
the top-3 page fetch — no additional metered call.

**Done when:** clicking a keyword yields a verdict and a concrete action list,
with every metered element behind its own button.

## Testing

Unit tests for the pure pieces: exclusion tokenization and fit classification,
seed generation across all four `service_area_kind` values, geo derivation from
a selected area. Schema parity for both dialects. A regression test that no
metered query fires on mount or on run restore — the failure mode that
previously leaked money. Existing `e2e/keyword-research-navigation.spec.ts`
must stay green.

`npm run ci:check` (prettier, knip, tsc, oxlint) and `npm test` gate each
phase's commit.
