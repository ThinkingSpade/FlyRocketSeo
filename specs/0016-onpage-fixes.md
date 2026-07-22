# 0016 — On-Page Fixes (Batch 3)

Boostifai's report leads with "we automated 41 on-page optimizations." We don't
auto-edit anyone's live site, but we can do the valuable half: generate specific,
publishable rewrites and let the user approve them. Approved fixes then flow into
the Client Report's Improvements chapter as proof of work.

## What it does

A new **On-Page Fixes** tab (My Site group) lists concrete rewrites per page:

- **Title / meta / H1 / alt** suggestions, each showing current → suggested with
  a one-line reason.
- **Keyword-informed**, not cosmetic: the strongest rule surfaces a query the
  page already earns impressions for but never names in its title. That gap is
  real ranking value, and it comes from free first-party GSC data.
- **Approve / exclude** per suggestion or per page, with per-element progress
  tiles and a Recommended-Fixes banner.
- Optional **one-click AI rewrite** of pending titles/metas (see Cost).

## Data flow

```
site audit crawl (stored)  ─┐
                            ├─► buildSuggestions (pure) ─► page_optimizations ─► tab UI
GSC query×page (free)      ─┘                                    │
                                                                 └─► approved rows ─► Client Report ch.03
```

- `getContentPerformance` is not reused; generation calls GSC `["query","page"]`
  directly so each page knows its own queries.
- Nothing is generated until the user clicks **Generate / Re-scan**.

## Cost

- **Rules engine + approve/exclude: zero API cost.** Crawl data is already
  stored; GSC is free first-party data. This is the whole feature for a
  key-less deployment.
- **AI rewrite: metered, opt-in, one click.** Uses the existing OpenRouter
  provider (`getChatAgentModel`) via `generateObject`, bounded to 25 items per
  call, titles/metas only. Without `OPENROUTER_API_KEY` the server function
  throws `PAYMENT_REQUIRED` and the button is hidden — same gate pattern as SAM.

## Persistence & regeneration

`page_optimizations` (D1 + PG, parity-tested). Unique on
`(project_id, url, element, target)`; `target` is NOT NULL (default "") because
both dialects treat NULLs as distinct in a unique index, which would let
duplicate page-level rows through.

Re-scanning **preserves decisions**: `planMerge` (pure, tested) keeps a row's
status when the suggested text is unchanged, resets it to `pending` when the
text changed (the user never saw the new wording), and drops rows the crawl no
longer produces (issue fixed, or page gone).

## Files

- `server/lib/onpage/suggestions.ts` (+test) — rule engine
- `server/lib/onpage/mergeSuggestions.ts` (+test) — status-preserving merge
- `server/features/onpage/repositories/PageOptimizationRepository.ts`
- `server/features/onpage/services/OnPageService.ts` — generate from crawl + GSC
- `server/features/onpage/services/OnPageAiService.ts` — metered rewrite
- `serverFunctions/onPage.ts` — get / generate / setStatus / rewrite
- `client/features/onpage/onPageModel.ts` (+test) — grouping & progress
- `client/features/onpage/OnPageParts.tsx`, `OnPageFixesPage.tsx`
- `routes/_project/p/$projectId/on-page.tsx`, nav item (PencilRuler)
- Client Report ch.03 gains an "optimizations done" table from approved fixes
- `db` migrations `0030` (D1) / `0007` (PG)
