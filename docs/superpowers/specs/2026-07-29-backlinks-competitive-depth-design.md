# Backlinks: competitive depth (Ahrefs / Semrush parity)

Date: 2026-07-29
Status: approved (user pre-approved the plan)
Surface: `/p/$projectId/backlinks` — the existing Backlinks tab. **No new routes.**

## Why

The Backlinks tab answers "what does my link profile look like?" It cannot answer the two
questions an agency actually gets asked:

1. **"How do I compare to my competitors?"** — the explicit request.
2. **"Where do I get links from next?"** — which is the same question phrased as work.

Ahrefs answers both with _Link Intersect_ and _Competing Domains_; Semrush with _Backlink Gap_
and _Backlink Audit_. We already pay DataForSEO for a `/v3/backlinks/summary/live` call whose
response carries several breakdowns we currently discard, and the `dataforseo-client` SDK
already exposes ten backlinks endpoints we have never wired.

## Constraints (non-negotiable, from prior waves)

- **Zero auto-spend.** Every metered call is gated behind `useMeteredQuery` with an `authorized`
  flag that can only be set by a click in the current mounted session. Restored runs
  (`isRestoredRun`) render free panels only. Sibling components must not self-fetch.
- **Prefer free data.** A panel that can be derived from bytes already on the page ships as a
  derivation, not a new call.
- **Icons:** bare muted lucide glyphs via `InsightIcon`. No chips, no colored icon tiles.
- **No new route files.** Everything mounts inside `BacklinksBody`, or as new sub-tabs of the
  existing results card. Adding a route means regenerating `routeTree.gen.ts`, which has burned
  us before.
- **Credits:** `/v3/backlinks/*` already maps to the `backlinks` `CreditFeature` via
  `mapDataforseoPathToCreditFeature`. No new credit features, no new `RUN_FEATURES` entries.

## Scope — ten features in three waves

### Wave 1 — free depth (no new API calls at all)

| #   | Feature                                                                                                                      | Source of data                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Link attributes, platforms & placement** breakdowns — nofollow/ugc/sponsored, blog/cms/ecommerce, article/sidebar/footer   | `referring_links_attributes`, `referring_links_platform_types`, `referring_links_semantic_locations` on the summary call we **already make** |
| F2  | **Dofollow vs nofollow** ratio card                                                                                          | `referring_domains_nofollow` / `referring_pages_nofollow`, same call                                                                         |
| F3  | **Authority (Domain Rank) history** chart                                                                                    | `rank` already present in `backlinksTrendRowSchema` and already fetched                                                                      |
| F4  | **Anchor text health** — branded / exact-match / naked-URL / generic / image / empty split with an over-optimization warning | derived from the anchors sub-tab rows                                                                                                        |
| F5  | **Referring-domain quality distribution** — DR buckets histogram                                                             | derived from the referring-domains sub-tab rows                                                                                              |
| F6  | **Toxic link audit + `disavow.txt` export** — spam-score grouping in Google's disavow format                                 | derived from backlinks / referring-domain rows already fetched                                                                               |

F1 and F2 need `backlinksSummaryItemSchema`, the overview mapper and
`backlinks-results.ts` extended. Everything else is pure client-side derivation with unit tests.

### Wave 2 — competitor comparison (the explicit ask)

| #   | Feature                                                                                                                                                                                                                  | Endpoint                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F7  | **Backlink comparison** — you + up to 4 competitors side by side: Domain Rank, backlinks, referring domains, spam score, new/lost referring domains. One row per target, plus a bar viz and a "you are #N of M" verdict. | `bulk_ranks`, `bulk_backlinks`, `bulk_referring_domains`, `bulk_spam_score`, `bulk_new_lost_referring_domains` — **one call each for all targets**, so 5 calls total regardless of competitor count |
| F8  | **Link Intersect** — referring domains that link to _k of your N competitors_ but **not** to you, ranked by intersection count then domain rank. CSV export.                                                             | `domain_intersection` with `targets: {1..N}` + `exclude_targets: [you]`                                                                                                                             |
| F9  | **Competing domains** — sites that share your referring domains, i.e. who you actually compete with for links                                                                                                            | `backlinks/competitors`                                                                                                                                                                             |

Competitor domains are entered as chips. **There is no persisted per-project competitor list**
in this codebase — the Competitors tab discovers them live and records the run in
`analysis_runs`, which is a restorable result rather than a curated list. So instead of a
prefill, F9 doubles as the discovery step: its results carry a one-click "Compare" button that
adds a domain to the chips. Nothing fires until **Compare** is clicked.

### Wave 3 — feeds and network risk

| #   | Feature                                                                                    | Endpoint                                                    |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| F10 | **Won / lost link views** — see the actual links won and lost, not just the monthly counts | existing `backlinks/live` with `is_new` / `is_lost` filters |
| F11 | **Referring networks** — subnet concentration, flagging link-network risk                  | `referring_networks`                                        |

F10 ships as a **status filter on the existing Backlinks sub-tab**, not as two new sub-tabs.
Adding a tab means threading a new value through the URL search schema, the sort schemas, the
tab strip, the filter panel and the export — a large surface for no extra answer. As a filter it
reuses the sorting, paging and export that are already tested. Asking for lost links overrides
the existing "hide lost" toggle rather than contradicting it into an empty result.

## Architecture

Follows the existing three-layer split exactly:

```
src/shared/backlink-targets.ts                   (new)  target normalizer, shared both ways
src/server/lib/dataforseo/backlinks-bulk.ts      (new)  bulk_* + referring_networks fetchers
src/server/lib/dataforseo/{fetchers,client}.ts   (edit) register the new fetchers for metering
src/server/features/backlinks/services/
    backlinksComparison.ts / .test.ts            (new)  merge five bulk responses into rows
    backlinksCompareMappers.ts / .test.ts        (new)  keyed-intersection + network shaping
    BacklinksCompareService.ts                   (new)  R2 cache + the four entry points
    backlinksApiFilters.ts                       (edit) F10 status filter
src/types/schemas/backlinks-compare.ts           (new)  requests + results
src/serverFunctions/backlinks.ts                 (edit) four new metered server functions
src/client/features/backlinks/
    useBacklinksCompare.ts                       (new)  chips + four independently gated queries
    BacklinksCompareSection.tsx                  (new)  the block, hidden on a restored run
    BacklinksCompareCard.tsx / .test.ts          (new)  chips + comparison leaderboard
    BacklinksGapCards.tsx                        (new)  F8, F9, F11
    BacklinksProfileInsights.tsx / .test.ts      (new)  F2, F4, F5, F6
    anchorHealth.ts / .test.ts                   (new)  F4 derivation
    domainQuality.ts / .test.ts                  (new)  F5 derivation
    disavow.ts / .test.ts                        (new)  F6 derivation + file format
    followSplit.ts / .test.ts                    (new)  F2 derivation
    BacklinksProfileSections.tsx                 (edit) F1 breakdowns
    BacklinksPageCharts.tsx                      (edit) F3 authority chart
    BacklinksFilterPanel.tsx                     (edit) F10 status control
```

The normalizer lives in `shared/` rather than beside the service because the client needs it to
de-duplicate chips, and importing it from the service would pull the 1.6 MB `dataforseo-client`
SDK into the browser bundle — the exact cold-start bloat a previous wave spent a refactor
removing.

Data flow is unchanged: server function → `BacklinksService`-style service (R2 cache keyed by
organization + inputs) → `dataforseo` fetcher → zod-validated envelope.

## Error handling

Each new panel owns its own error state and fails closed: a failed comparison call renders an
inline retry inside its card and never blocks the rest of the page. DataForSEO billing errors
already classify through `createDataforseoBillingClassifier`, which the new fetchers reuse.

## Testing

- Pure helpers (anchor classification, DR bucketing, disavow formatting, comparison merge and
  ranking) get vitest unit tests next to the module, **importing statically at the top of the
  file** — deferred `await import()` inside test bodies is what caused the 5s-timeout flakiness.
- Zod schemas are exercised against realistic DataForSEO payload fixtures, including the
  misspelled `reffering` keys.
- Browser verification of the rendered page at the end.

## Explicitly out of scope

- Backlink alerts / email digests (needs a scheduler and a notification surface).
- Historical storage of competitor comparisons in D1 (no migration in this change).
- `page_intersection` — overlaps F8 without adding a distinct answer.
