# Local geo targeting for research tabs

**Date:** 2026-07-27
**Status:** Approved design, ready for planning

## Problem

The app is country-only by construction. `src/shared/keyword-locations.ts` holds
271 location options and every one of them is a country. A project stores a
single `locationCode`, onboarding can only set it to a country, and every
research tab inherits it.

For a national brand that is correct. For deliotx.com — a coffee and water
service operating in Dallas–Fort Worth — it is the wrong question. National
search volume overstates a market they cannot serve, a national SERP shows
competitors they will never meet, and "office coffee service" nationally is a
different keyword from "office coffee service" in DFW.

The gap is not cosmetic. A local business making content and budget decisions
from national numbers is being told to chase demand that is not theirs.

## The constraint that shapes everything

`specs/0004-keyword-data-source-routing.md` already documents the provider
split. Extending it below country level is not uniform across metrics:

| Data                                          | Country (DataForSEO Labs) | Metro / city                                      |
| --------------------------------------------- | ------------------------- | ------------------------------------------------- |
| Search volume                                 | Labs                      | Google Ads endpoints (full Google geotarget list) |
| Keyword difficulty                            | Labs                      | **Unavailable** — Labs is country-only            |
| Search intent                                 | Labs                      | **Unavailable**                                   |
| SERP results, rank tracking                   | SERP API                  | SERP API (supports city codes)                    |
| Domain overview, ranked keywords, competitors | Labs                      | **Unavailable**                                   |
| Local pack / GBP                              | —                         | already served via `location_coordinate`          |

So going local buys real local demand and a real local SERP, and costs keyword
difficulty, search intent, and every Labs domain analytic. A naive "just set the
project to DFW" would silently empty the Keyword Research table's Difficulty and
Intent columns and break Domain Overview and Competitors outright.

There is also a blocking defect. `getKeywordDataProvider()`
(`keyword-locations.ts:736`) returns `"labs"` for any code it does not
recognise, and Labs rejects sub-country codes. A metro code passed today fails
rather than degrades.

## Approach

A project declares a **target area**. A resolver then answers _per data need_,
not per project, which geography and provider to use, and every figure is
labelled with the geography it actually describes.

Rejected alternatives:

- **Let `locationCode` be a metro code.** One-line change, but it breaks on the
  routing defect above and, once fixed, silently removes difficulty, intent,
  and the Labs-backed tabs. Blunt, with invisible losses.
- **A per-tab metro picker with no project concept.** No migration and no
  detection, but it pushes the work onto the user on every tab. The point of
  this work is that the app should already know the customer is in DFW.

## Data model

Two new tables. The project's existing `locationCode` is untouched and remains
the country fallback, so nothing migrates and a project with no target area
behaves exactly as it does today.

```
project_target_areas
  id, projectId,
  kind            'metro' | 'city' | 'region' | 'country'
  locationCode    DataForSEO / Google geotarget code
  label           "Dallas-Fort Worth TX"
  parentCountryCode
  source          'gbp' | 'gsc' | 'manual'
  isPrimary
  confirmedAt     null until the user accepts the proposal
  createdAt

geo_locations
  code, name, type, stateCode, parentMetroCode, countryCode, population
```

`geo_locations` lives in D1 rather than a bundled table. `src/shared/` is
imported by server code, so anything placed there enters the Worker startup
graph — the same graph whose size caused multi-second cold starts and required
a 33-file lazy-loading refactor. A comprehensive US place list must not go
there.

Two small tables are bundled because they are tiny and want to be instant: the
~210 US DMAs (~8KB) and the 50 states.

## Detection

All signals are free. Highest confidence first:

1. **Cached Google Business Profile.** `LocalSeoService` already stores `city`,
   `region`, `latitude`, `longitude`. This is the business's own declared
   address, so it wins when present.
2. **Search Console evidence.** `getLocalLandingPages` in
   `projectGscInsights.ts` already finds local landing pages
   (`/service-areas/plano`, `/locations/dallas` — its `LOCAL_PATH_PATTERN`
   matches `locations`, `service-areas`, `areas-served`, `cities`, `city`,
   `local`) and city-bearing queries. Free, needs no GBP, and it is the signal
   that reveals _multi_-location.
3. **Manual picker.** Always available as an override, and the only path for a
   project with neither of the above.

**Detection produces a proposal, never an applied change.** `confirmedAt` stays
null until the user accepts. An unconfirmed proposal must not alter what any tab
queries — this is the invariant most likely to be broken by accident, and it has
its own test.

Multi-location is only offered when detection actually finds several distinct
areas. A single-location project never sees the concept.

**A tab queries exactly one area at a time — the primary, or whichever the user
selected from the switcher.** It never fans out across areas. Fanning out would
multiply the metered cost of every run by the number of areas, with no ceiling
and no confirmation, which is precisely the failure this codebase guards
against. Comparing areas is a later feature and would need its own explicit,
priced confirmation step; it is out of scope here.

## The geography resolver

One pure function, no I/O:

```ts
type GeoNeed =
  | "keyword-volume"
  | "keyword-difficulty"
  | "search-intent"
  | "serp"
  | "rank-tracking"
  | "domain-analytics"
  | "local-pack";

type ResolvedGeo = {
  locationCode: number;
  languageCode: string;
  provider: "labs" | "google_ads" | "serp" | "business";
  /** What this figure actually describes. Drives the UI label. */
  scope: "local" | "national";
  label: string;
};
```

| Need                | With a metro area                 | Without                                                                |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| keyword-volume      | Google Ads @ metro, `local`       | today's `getKeywordDataProvider(country)` result @ country, `national` |
| keyword-difficulty  | Labs @ parent country, `national` | same                                                                   |
| search-intent       | Labs @ parent country, `national` | same                                                                   |
| serp, rank-tracking | SERP API @ metro, `local`         | @ country, `national`                                                  |
| domain-analytics    | Labs @ parent country, `national` | same                                                                   |
| local-pack          | GBP `location_coordinate`         | unchanged                                                              |

`getKeywordDataProvider()` must be extended so a sub-country code routes to
`google_ads` rather than falling through to Labs. Nothing else in this design
works until that lands.

## Cost

Today one Labs call returns volume, difficulty and intent together. For a local
project those split into two metered calls: Google Ads at the metro for local
volume, Labs at the country for difficulty and intent.

**Decision: local volume by default, difficulty and intent on demand.** The run
fetches local volume — the figure the user actually wanted. The Difficulty and
Intent columns render a "Load" affordance that fetches national Labs data on an
explicit click. One call by default; the second only when asked.

**Bounded, and priced before the click.** The on-demand fetch covers the
keywords on the current page of the table (the existing page size), not the
whole result set, and issues one `keyword_overview` call for that page. Labs
bills per row, so an unbounded "load everything" on a 500-row research result is
a materially different bill from a 25-row page — the affordance therefore states
what it will fetch ("Load difficulty for these 25") rather than presenting an
unpriced button. Loading a second page is a second explicit click.

This matches how the rest of the app gates spend, and it keeps the no-automatic-
spend guarantee intact: opening a tab or switching areas never bills.

## UI

**Which tabs are affected.** Exactly these six, because they are the ones whose
answer changes with geography:

| Tab               | What becomes local          | What stays national            |
| ----------------- | --------------------------- | ------------------------------ |
| Keyword Research  | search volume               | difficulty, intent (on demand) |
| Keyword Trends    | series location             | —                              |
| SERP Overview     | the whole SERP              | competitor DR (Ahrefs, global) |
| Content Optimizer | the SERP it briefs against  | —                              |
| Rank Tracking     | tracked SERP position       | —                              |
| Topic Clusters    | volumes behind the clusters | —                              |

Deliberately unaffected: Domain Overview, Competitors and Backlinks (Labs and
backlink data are country-level or global, so a metro control there would be a
lie); Site Audit and On-Page (no geography); Local SEO and Local Rank Grid
(already local, via coordinates); GSC-derived tabs (Search Console has no metro
dimension).

**Scope control.** One control in each affected tab's header showing the active
area, not a picker per field:

```
Keyword Research                      Dallas-Fort Worth TX  v
```

**Per-metric labels attached to the number.** Geography belongs in the column
header where the figure is read:

| Keyword               | Volume · DFW | Difficulty · US | Intent · US |
| --------------------- | ------------ | --------------- | ----------- |
| office coffee service | 480          | _Load_          | _Load_      |

The `· DFW` / `· US` suffix is the whole convention — muted, no chips, applied
everywhere a metric carries a geography. It makes "this volume is local, this
difficulty is national" self-evident without a legend.

**Confirmation banner**, shown once, never auto-applied:

> Looks like you serve **Dallas-Fort Worth** — from your Google Business
> Profile. **[Use this for research]** · Not right?

**Verdict cards state their geography.** The guidance layer shipped in
`2026-07-27-smart-autofill-and-guidance-design.md` asserts things like "the top
results have a median DR of 58", which is a different claim locally than
nationally. Verdicts become "In Dallas-Fort Worth, the top results have a median
DR of 41…", and where a verdict leans on a national figure it says so. This is
the same defensibility rule already enforced there: never assert more precision
than the data carries.

## The location picker

Extends the existing `src/client/components/LocationSelect.tsx`, which already
has query filtering and keyboard navigation.

- **Search** is a debounced (150ms) call to a `searchGeoLocations` server
  function: a prefix query against D1 with `LIMIT 20`, ordered by population so
  "dal" surfaces Dallas before Dalton. Same-Worker D1 with an index answers in
  ~10-30ms, which reads as instant, and it covers every US place without
  shipping a megabyte to either bundle.
- **Metros and states never hit the network** — they come from the bundled
  tables.
- Results are grouped **Metros → Cities → States → Countries**, so the useful
  unit is first.
- Rows disambiguate: _Springfield, IL_ vs _Springfield, MO_. A bare US city name
  is ambiguous more often than not.
- The typed query stays selected while results reload, so typing never clears
  the current choice.
- `searchGeoLocations` reads D1 only. Browsing the picker cannot spend.

## Implementation order

1. **Verification spike — not code.** Confirm against the live API that Google
   Ads `keywords_for_keywords` / `search_volume` accept a DMA code and return
   data; that the SERP API accepts the same code; and that Labs rejects it. One
   cheap call each. **If the first fails, the local-volume half of this design
   is wrong — stop and re-plan rather than build on the assumption.**
2. Routing fix in `getKeywordDataProvider` + `resolveGeo`, both pure, both
   tested. No UI.
3. `geo_locations` table, seed script, `searchGeoLocations`, picker.
4. `project_target_areas`, detection cascade, confirmation banner.
5. Tab wiring: scope control, per-metric labels, on-demand difficulty.
6. Verdict cards state their geography.

**This is more than one implementation plan.** Steps 1–3 are a self-contained
deliverable: the spike settles whether the design holds, and the routing fix
plus the picker are useful and shippable on their own — a user can already
choose a metro even before anything defaults to one. Steps 4–6 are a second
plan that turns it on: detection, confirmation, and the tab wiring that changes
what people actually see.

Splitting there matters because step 1 can invalidate the rest. Writing one
plan across all six would mean authoring detailed tasks for wiring that a failed
spike would throw away.

## Testing

Pure logic only, per this repo's `src/**/*.test.ts` / `environment: "node"`
constraint. React components are not tested here; the visual spec
(`e2e/insights-visual.spec.ts`) covers rendering.

- `resolveGeo` — every `GeoNeed` × (metro area / no area), asserting provider,
  code and `scope`.
- `getKeywordDataProvider` — sub-country codes route to `google_ads`, not the
  current silent fall-through to Labs.
- Detection — GBP present, GSC-only, both absent, multi-location, conflicting
  signals.
- City→metro mapping, including ambiguous names.
- **An unconfirmed proposal never changes a query's location.**

## Error handling

- No GBP and no GSC: no proposal, no banner, country default stands. Silent.
- Seed script not run: picker degrades to bundled metros and states. No error.
- A stored code the provider rejects: fall back to the parent country and say so
  in the UI rather than rendering an empty table.
- Google Ads returns no data for a metro: show the national figure, labelled
  national, rather than a blank cell.

## Risks on the record

- **Google Ads volumes are bucketed and aggregate close variants**, so a local
  figure is coarser than the Labs national one. The UI must not imply a
  precision it does not have.
- **A DMA is not a service radius.** A business at the edge of DFW may care
  about Sherman, which the DMA excludes. Radius targeting is out of scope.
- **Seed freshness.** Google's geotarget list changes; the seed script is a
  point-in-time snapshot and needs an occasional re-run.

## Out of scope

- Radius and service-area polygons.
- Per-suburb breakdowns beneath a metro.
- Non-US DMA equivalents beyond whatever DataForSEO supplies.
- Any change to how Local SEO and Local Rank Grid work today.
