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

Competitor domains are prefilled from the project's saved competitor list where one exists, and
are editable as chips. Nothing fires until **Compare** is clicked.

### Wave 3 — feeds and network risk

| #   | Feature                                                                                                         | Endpoint                                                    |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| F10 | **New & Lost link feeds** — two new results sub-tabs listing the actual links won and lost, not just the counts | existing `backlinks/live` with `is_new` / `is_lost` filters |
| F11 | **Referring networks** — IP / subnet concentration, flagging link-network risk                                  | `referring_networks`                                        |

## Architecture

Follows the existing three-layer split exactly:

```
src/server/lib/dataforseo/backlinks-bulk.ts      (new)  zod schemas + fetchers for bulk_*
src/server/lib/dataforseo/backlinks-insights.ts  (edit) referring_networks, page_intersection
src/server/features/backlinks/services/
    backlinksComparison.ts                       (new)  pure merge/rank helpers + tests
    BacklinksCompareService.ts                   (new)  R2 cache + credit attribution
src/serverFunctions/backlinks.ts                 (edit) new metered server functions
src/client/features/backlinks/
    BacklinksCompareCard.tsx                     (new)  competitor chips + comparison table
    LinkIntersectCard.tsx                        (new)
    CompetingDomainsCard.tsx                     (new)
    anchorHealth.ts / .test.ts                   (new)  F4 derivation
    domainQuality.ts / .test.ts                  (new)  F5 derivation
    disavow.ts / .test.ts                        (new)  F6 derivation + file format
    BacklinksProfileSections.tsx                 (edit) F1, F2 breakdowns
    BacklinksPageCharts.tsx                      (edit) F3 authority chart
```

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
