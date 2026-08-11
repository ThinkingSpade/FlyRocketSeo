# Smart competitor discovery

Status: approved, not yet implemented
Date: 2026-08-10

## Problem

The Competitors tab answers the wrong question and forgets its own answers.

**It finds the wrong rivals.** Discovery calls `dataforseo_labs/google/competitors_domain/live`
seeded by the project's domain alone (`fetchCompetitorsDomain`,
`src/server/lib/dataforseo/labs-competitors.ts:45`). That endpoint returns domains whose
_ranked-keyword sets intersect_ with the target, ordered by absolute intersection count. Two
consequences follow:

- A domain with an enormous keyword footprint beats a real rival on raw overlap. For the
  AmericaVending.com project the tab returned webstaurantstore.com (685,753 organic keywords,
  19 shared) above every genuine competitor.
- A rival that outranks the client but does not yet _share_ indexed keywords with them can
  never appear at all. The client's actual rivals — vendingexchange.com, avfusa.com — were
  absent from a nine-row list.

The displayed "% keyword overlap" divides shared keywords by the _competitor's_ keyword count,
so every row reads 0–1% and the column carries no information.

Nothing in the request is client-aware: the tab knows the project's business profile, its
confirmed target area, and its real Search Console queries, and uses none of them.

**It forgets.** The user must press Analyze on every visit even when a paid result is already
cached. Two independent causes, both confirmed in code:

1. `useAutoRestoredRun` is gated on `enabled: target.trim() === ""`
   (`src/client/features/competitors/CompetitorsPage.tsx:103`). The target input is prefilled
   from the project domain, so a target is almost always present, so restore almost never
   runs. Meanwhile the metered query stays disabled until the user authorizes a run. The state
   _target present + not authorized + restore suppressed_ renders blank — while R2 already
   holds the answer and reading it costs nothing.
2. `CompetitorsPage` destructures only `{ restored }` from the hook
   (`CompetitorsPage.tsx:99`), discarding its `outcome` and `expired` fields. Run payloads live
   under an R2 prefix Cloudflare deletes after 7 days (per `useAutoRestoredRun.ts:80`), so an
   expired run collapses into the same silent blank prompt as never-having-run.

## Approach

Seed discovery with the keywords the client actually competes on, then rank candidates by
whether they _beat_ the client on those keywords.

`dataforseo_labs/google/serp_competitors/live` accepts a **keyword list** as its seed
(`DataforseoLabsGoogleSerpCompetitorsLiveRequestInfo`: `keywords`, `location_code`,
`language_code`, `item_types`, `limit`, `filters`, `order_by`). Each returned item carries
`domain`, `avg_position`, `median_position`, `etv`, `keywords_count`, `visibility`,
`relevant_serp_items`, and `keywords_positions` — the per-keyword ranks for that domain
(`DataforseoLabsSerpCompetitorsLiveItem`). This endpoint is not currently wrapped in this repo.

Rejected alternatives:

- _Keep domain-seeded discovery, add an AI relevance filter._ Cannot surface a rival the
  endpoint never returned, and semantic classification needs `OPENROUTER_API_KEY`, which is
  unset in this deployment. The ranking below achieves the same demotion deterministically.
- _Manual competitor list only._ Accurate and free, but discovers nothing. Retained as a
  complement (see Pinning), not a replacement.

## Design

### 1. Seed selection — free, from Search Console

A pure function `buildCompetitorSeed(rows, profile, options)` over GSC query rows already
available through `src/server/features/gsc/searchPerformanceReport.ts`.

- Window: trailing 28 days, query dimension, with the project's own position per query.
- Drop branded queries by matching against `project_profiles.brandTerms` (one term per line).
  A branded SERP returns the client and nobody else, so branded seeds waste the keyword budget.
- Prefer queries where the client does **not** already rank #1 — those are the queries where a
  rival exists to be found. Queries at position 1 are kept only to backfill if the preferred
  set is short.
- Order by impressions descending; cap at 40 keywords (`COMPETITOR_SEED_SIZE`).
- Return the chosen keywords _and_ the client's own position for each, since ranking needs both.

The resolved seed is displayed in the UI so the answer is auditable: the user can see the tab
asked "who beats you on these 40 queries."

Minimum viable seed is 5 keywords. Below that the seed is not representative and discovery
falls back to the domain-seeded path (section 5).

### 2. Discovery — one metered call

New wrapper in `src/server/lib/dataforseo/labs-competitors.ts`, matching the file's existing
shape (`DataforseoApiResponse`, `assertOk({ treatNoResultsAsEmpty: true })`, `buildTaskBilling`):

```
fetchSerpCompetitors(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  itemTypes?: DataforseoLabsItemType[];
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<{ items: SerpCompetitorItem[]; totalCount: number | null }>>
```

`locationCode` comes from the project's confirmed `project_target_areas` row via the existing
`resolveRunGeo` / target-area plumbing, captured at authorization time by
`useCompetitorsRun` — never read live, for the billing-safety reason that hook already
documents. A local operator is measured against its own metro, not against US-national SERPs.

**Cost, verified against DataForSEO's published pricing (2026-08-10):**
`serp_competitors` bills **$0.012 per task plus $0.00012 per returned domain row**. A live call
carries one task and takes the keywords as an array, so **a 40-keyword seed is one billed task,
not forty** — the whole design rests on this and it holds. `competitors_domain` bills on the
identical schedule, so switching endpoints is not a cost regression at equal row counts.
Documented caps: **200 keywords per request** (our seed of 40 is well inside) and a **1,000-row
`limit`**. The wrapper still returns `buildTaskBilling(task)`, so the observed cost is recorded
on the first live run and can be checked against this figure.

**`item_types` must be pinned to `["organic"]`.** The endpoint's default item types include
_paid_ results as well as organic. Left at the default, a competitor's ad placement would be
compared against the client's organic GSC position and counted as "outranking" them — inflating
the headline metric with positions the client is not competing for. `keywords_positions` is
`Record<string, number[]>` (a domain can hold several positions for one keyword), so the ranking
reduces each to the best/minimum rank explicitly rather than assuming a scalar.

### 3. Ranking — "who actually beats you"

A pure function `rankSerpCompetitors(items, seed, selfDomain)` producing one row per candidate:

| Column                | Derivation                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage              | `keywords_count / seed.length` — share of **your** seed they rank for. Replaces the meaningless 0–1% column.                                                              |
| Beats you on          | Count of seed keywords where their position (from `keywords_positions`) is better than the client's GSC position for the same keyword. **Headline metric, default sort.** |
| Position delta        | Median(their position) − median(client position) across shared keywords. Negative = ahead of you.                                                                         |
| Avg / median position | Straight from the item.                                                                                                                                                   |
| Est. traffic          | `etv`.                                                                                                                                                                    |

Rows are sorted by beats-you count descending, then by position delta ascending. The client's
own domain is excluded. A domain that ranks on two of your forty queries sinks; a domain that
outranks you on thirty rises — which is what demotes marketplaces without any AI pass.

Ties and absent data: a candidate with no `keywords_positions` overlap gets a beats-you count
of 0 and sorts on coverage alone; it is never dropped silently.

### 4. Pinned and excluded competitors — per project

New table `project_competitors` (migration `0039`), on both dialects
(`src/db/app.schema.ts` and `src/db/pg/app.schema.ts`, which this repo keeps in step):

```
id            text primary key
project_id    text not null references projects(id) on delete cascade
domain        text not null              -- normalized via normalizeDomainInput
status        text not null              -- "pinned" | "excluded"
note          text not null default ""   -- why, in the operator's words
created_at    text not null default (current_timestamp)
updated_at    text not null default (current_timestamp)
unique index on (project_id, domain)
```

- **Pinned** domains are always shown, at the top, even if discovery did not return them. They
  are marked "pinned" rather than being passed off as a discovery result. Metrics for a pinned
  domain that discovery missed are left blank rather than fabricated.
- **Excluded** domains are filtered from results for that project permanently, with a count
  surfaced ("3 domains hidden — manage") so exclusion is never invisible.
- Scoped per project, so one agency account holds a different list per client.

This is what makes the tab improve for a client over time, and it feeds Keyword Gap and Link
Gap: those tabs offer pinned competitors first instead of asking the user to retype a domain.

### 5. Fallback when Search Console is missing

If the project has no GSC connection, or the seed comes back under 5 keywords, discovery falls
back to today's `competitors_domain` path unchanged, labelled in the UI as a weaker signal
("Based on shared keywords, not your Search Console queries — connect Search Console for a
sharper answer"). The tab always returns something; it never silently substitutes the weaker
method without saying so.

### 6. Restore fix

- Re-gate restore on _"no live result for this target"_ rather than _"no target"_:
  `enabled: competitorsQuery.data == null && tab === "competitors"`. Restore reads D1 + R2 only
  and can never bill, so running it whenever there is no live result is safe by construction.
- When a target is present, only adopt a restored run whose `label` matches that target, so a
  cached run for one client's domain never renders under another's.
- Consume the hook's `outcome` and `expired`. An expired run shows "Your last run for
  &lt;label&gt; from &lt;date&gt; has expired — run it again", not a blank first-use prompt.
  `unreadable` says so too.

## Data flow

```
GSC query rows (free) ──┐
project_profiles.brandTerms ──┤
                              ├─> buildCompetitorSeed ─> keywords[] + self positions
project_target_areas ─────────┘                                  │
                                                                 v
                                        fetchSerpCompetitors (ONE metered call)
                                                                 │
                                                                 v
                                     rankSerpCompetitors(items, seed, selfDomain)
                                                                 │
                                        project_competitors ─────┤ (pin / exclude)
                                                                 v
                                     CompetitorsTable  +  R2 cache  +  analysis_runs
```

## Files

New:

- `src/server/features/competitors/competitorSeed.ts` — `buildCompetitorSeed`, pure.
- `src/server/features/competitors/rankSerpCompetitors.ts` — ranking, pure.
- `src/server/features/competitors/repositories/ProjectCompetitorRepository.ts`
- `src/serverFunctions/projectCompetitors.ts` — list / pin / exclude / remove.
- `drizzle/0039_*.sql` + both schema files.
- Tests beside each pure module.

Changed:

- `src/server/lib/dataforseo/labs-competitors.ts` — add `fetchSerpCompetitors`.
- `src/server/features/competitors/services/CompetitorsService.ts` — orchestrate seed →
  discovery → rank → pin/exclude, keep the R2 cache and `AnalysisRunService.record` behaviour.
- `src/types/schemas/competitors.ts` — extend `CompetitorRow` with `coverage`, `beatsYouCount`,
  `positionDelta`, `source: "serp" | "domain"`, `pinned: boolean`.
- `src/client/features/competitors/CompetitorsPage.tsx` — restore gate, expired/unreadable
  states, seed disclosure, hidden-count affordance.
- `src/client/features/competitors/CompetitorsTable.tsx` — new columns, pinned row treatment.

`CompetitorsService.ts` already carries the page's caching, run-recording and mapping. Adding
orchestration inline would push it past this repo's file-size ceiling, so seed building and
ranking live in their own modules — which is also what makes them unit-testable without an API
key.

## Schema change to `CompetitorRow`

`competitorsPageSchema` is the stored shape for `analysis_runs` restores. Adding required
fields makes every stored run `unreadable` under the new schema. New fields are therefore
optional/nullable, so historical runs still restore and simply show blanks in the new columns.

## Testing

Unit, no API key required:

- `buildCompetitorSeed`: branded-term exclusion (including multi-line and case differences),
  the not-#1 preference and its backfill, impression ordering, the 40 cap, the 5-keyword floor.
- `rankSerpCompetitors`: beats-you counting against self positions, coverage denominator is the
  seed (not the competitor's keyword count), self-domain exclusion, missing
  `keywords_positions`, tie ordering.
- Pin/exclude: excluded domains absent and counted; pinned domains present, ordered first, and
  flagged even when discovery missed them; per-project scoping.
- Restore: a run whose label mismatches the active target is not adopted; `expired` and
  `unreadable` produce their own states rather than the first-use prompt.

Manual verification, on the AmericaVending.com project: the run surfaces vendingexchange.com
and avfusa.com, and webstaurantstore.com either drops out or shows a beats-you count near zero.
This is the acceptance test for the whole feature — the design is wrong if it fails.

## Out of scope

- Backfilling competitors for existing projects.
- Automatic competitor tracking over time (a competitor-movement chart).
- Changing Keyword Gap or Link Gap beyond offering pinned competitors as suggestions.
- Raising the 7-day R2 payload lifetime; this design reports expiry honestly rather than
  preventing it.
