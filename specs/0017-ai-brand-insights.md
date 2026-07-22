# 0017 — AI Brand Insights (Batch 4)

Brand Lookup already answers "how does AI search cite this brand right now?" but
it's stateless (R2 cache only) and starts from a blank search box. Batch 4 turns
it into a **project-centric, tracked insight** that also feeds the Client Report
— without changing what an ad-hoc lookup costs.

## What it does

Three additions on top of the existing `ai-search` feature. The paid gate and
DataForSEO metering are unchanged; nothing here adds an automatic spend.

### P1 — Project-centric + tracked

- The Brand Lookup tab's default state (no `q` in the URL) becomes a one-click
  **"Analyze `<project.domain>`"** card instead of a blank form. If the project
  has no domain, the blank form is shown as today. The ad-hoc "look up any
  brand" form stays available.
- Running the project analysis persists a **daily snapshot** of the headline
  metrics. Ad-hoc lookups of other brands are never stored, so the tracked
  series only ever contains the project's own target.
- The tab gains a **trend** (mentions + share-of-voice over time) and
  **"since last check"** deltas read from stored snapshots — the thing a
  stateless lookup can't show.

### P2 — AI Visibility report chapter

- New **"05 — AI Visibility"** chapter in the Client Report (bumps "Next steps"
  to 06), fed by the latest stored snapshot: total mentions across ChatGPT +
  Google AI Overview, share-of-voice vs. competitors, and top cited pages.
- **Zero extra API cost** — it reads the snapshot. No snapshot yet → a short
  "run an AI brand analysis to include this" note, never an auto-spend.

### P3 — AI visibility opportunities

- An **"Improve your AI visibility"** section derived **purely from the current
  lookup result** (zero extra API cost):
  - **Share-of-voice gaps** — competitors that out-mention the target, ranked
    by the mention gap.
  - **Prompt-absence gaps** — from `topQueries`: questions whose AI answers cite
    sources but none of them is the target's own domain or a subdomain of it —
    answers others get cited in and you don't.
- Deriving competitors' _own_ cited pages would need extra paid calls, so it is
  deliberately out of scope — the two gap types above use data already paid for.

## Data flow

```
analyzeProjectBrand (metered, user click)
   └─ getBrandLookup (existing, stateless)  ─► BrandLookupResult
        ├─► snapshotFromResult (pure) ─► brand_visibility_snapshots (upsert/day)
        └─► buildOpportunities (pure) ─► tab "opportunities" section

getBrandVisibilityHistory (free) ─► snapshots ─► trend + deltas (pure)
                                            └─► Client Report ch.05
```

## Persistence

`brand_visibility_snapshots` (D1 `0031` + PG `0008`, parity-tested). One row per
`(project_id, target, captured_on)` — `captured_on` is a `YYYY-MM-DD` date, so a
second analysis the same day **upserts** (same proven pattern as
`page_optimizations`). Denormalized headline columns (`total_mentions`,
`chatgpt_mentions`, `google_mentions`, `target_share_pct`) drive cheap trend
queries; `result_json` stores the shaped `BrandLookupResult` so the report and
opportunities render richly without a re-fetch.

## Cost

- **Snapshots, trend, report chapter, opportunities: zero API cost.** They reuse
  the single lookup response the user already triggered, or read stored rows.
- **The analysis itself: metered exactly as Brand Lookup is today** — same paid
  gate, same DataForSEO calls, only ever on an explicit click. Honors the
  no-auto-spend rule.

## Files

- `types/schemas/brand-visibility.ts` — snapshot row + history schemas
- `server/lib/brand-visibility/snapshot.ts` (+test) — result → stored snapshot
- `server/lib/brand-visibility/trend.ts` (+test) — series + "since last" deltas
- `server/lib/brand-visibility/opportunities.ts` (+test) — SoV + prompt gaps
- `server/features/ai-search/repositories/BrandVisibilitySnapshotRepository.ts`
- `server/features/ai-search/services/brandVisibility.ts` — analyze + history
- `serverFunctions/brandVisibility.ts` — analyzeProjectBrand / getHistory
- `client/features/ai-search/components/` — project-centric card, trend,
  opportunities; wired into `BrandLookupPage`
- Client Report ch.05 + `useClientReportData` snapshot query
- `db` migrations `0031` (D1) / `0008` (PG)
