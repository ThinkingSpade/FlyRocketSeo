# Local Geo Targeting — Activation (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the geo foundation on — detect a project's target area, confirm it once, and let the affected tabs actually query it, with every figure labelled for the geography it describes.

**Architecture:** A `project_target_areas` table holds confirmed areas. A detection cascade proposes one from free signals (cached Google Business Profile, then Search Console evidence). Nothing applies until the user accepts. Tabs then resolve geography per data need through the existing `resolveGeo`.

**Spec:** `docs/superpowers/specs/2026-07-27-local-geo-targeting-design.md` (steps 4–6)
**Plan 1 (done):** `docs/superpowers/plans/2026-07-27-local-geo-targeting-foundation.md`

## State this plan builds on — all live in production

- `geo_locations` seeded with **62,745 US rows**, including all **210 DMA regions**.
- `resolveGeo(need, area, country)` — pure, tested, returns `{ locationCode, languageCode, provider, scope, label }` and `provider: "none"` where a figure genuinely cannot be produced.
- `getKeywordDataProvider` routes sub-country codes to Google Ads and rejects garbage codes below `MIN_SUB_COUNTRY_LOCATION_CODE`.
- `searchGeoLocations` — free, D1-only, case-insensitive on both dialects.
- `GeoLocationSelect` — grouped picker, built but **wired into nothing**.

## Two facts discovered from the seeded data — read before writing tests

1. **The real Dallas–Fort Worth DMA code is `200623`.** Plan 1's tests all used `1026339`, which was invented. It never mattered for pure logic, but do not propagate it. Where a test wants a realistic DMA code, use `200623` and comment that it was verified against seeded production data.
2. **Stored names carry DataForSEO's full hierarchy**: `"Dallas-Ft. Worth, TX,Texas,United States"`. Rendered raw that is unreadable. A display-name helper is Task 1 of this plan, and it needs tests against the real stored format — including the missing space after the commas.

## Global Constraints

- **`pnpm ci:check`** = `prettier --check . && knip && tsc --noEmit && oxlint . --type-aware`. All four must pass.
- **Dual-dialect schema.** Any new table goes in BOTH `src/db/app.schema.ts` and `src/db/pg/app.schema.ts`, or `src/db/schema-parity.test.ts` fails. Generate with `pnpm db:generate`, apply with `pnpm db:migrate:local`, commit the generated migration.
- **Vitest collects only `src/**/\*.test.ts`** (`.ts`, not `.tsx`), `environment: "node"`. Pure logic gets tests; React components get none.
- **oxlint `no-unsafe-type-assertion`**, `max-lines-per-function` (320, applies to `describe` blocks), `max-params`, `max-lines`. Refactor, never suppress.
- **knip fails on unused exports.**
- **No automatic metered spend.** Detection reads only free/cached sources. Selecting or confirming an area must never trigger a metered call — it changes what the _next_ user-initiated run queries, nothing more.
- **Never assert a geography a figure does not have.** Every number rendered under a target area must carry its true scope, and `resolveGeo` already computes it — use it, do not re-derive.
- Comments explain WHY. Package manager is **pnpm**.

---

## The one assumption still unverified

The spec's step-1 spike was never executed: we have **not** confirmed that Google Ads `search_volume` accepts a DMA `location_code` and returns data, nor that the SERP API does.

The seed proves DMA codes are real Google geotargets. It does not prove the keyword endpoints accept them.

**This plan does not attempt to settle that with a paid spike.** Instead the wiring must degrade honestly, so the first real user-initiated run _is_ the verification and a rejection surfaces as a clear message rather than a crash or a silent wrong number. Task 6 covers that explicitly.

---

## Task 1: Readable location names

**Files:**

- Create: `src/shared/geo/geoDisplayName.ts` + `.test.ts`

**Interfaces:**

- Produces: `toGeoDisplayName(storedName: string, type: string): string`

- [ ] **Step 1: Write the failing tests**

Cover the real stored formats:

- `"Dallas-Ft. Worth, TX,Texas,United States"` + `"DMA Region"` ⇒ `"Dallas-Ft. Worth, TX"`
- a City row with the same trailing `,State,Country` shape ⇒ just the city and its state
- a name with no commas ⇒ returned unchanged
- a name with a space after the comma as well as without ⇒ both handled
- an empty string ⇒ empty string, no throw

Do NOT invent a stored format. If you are unsure what a City row looks like, query it — the data is live:
`pnpm exec wrangler d1 execute open-seo --remote --command "SELECT name, type FROM geo_locations WHERE type='City' LIMIT 5" --json`

- [ ] **Step 2: Run, see it fail, implement, run to green**

Run: `pnpm vitest run src/shared/geo/geoDisplayName.test.ts --no-file-parallelism`

- [ ] **Step 3: Use it in the picker**

`GeoLocationSelect` must render display names, not raw stored names. The stored name stays the search target — searching "Texas" should still match a row whose display name has been trimmed to `"Dallas-Ft. Worth, TX"`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm ci:check && pnpm vitest run --no-file-parallelism`

---

## Task 2: The `project_target_areas` table

**Files:**

- Modify: `src/db/app.schema.ts`, `src/db/pg/app.schema.ts`
- Generated: a migration under `drizzle/`

Columns per the spec: `id`, `projectId`, `kind` (`metro`|`city`|`region`|`country`), `locationCode`, `label`, `parentCountryCode`, `source` (`gbp`|`gsc`|`manual`), `isPrimary`, `confirmedAt` (nullable), `createdAt`.

- [ ] **Step 1: Read `geoLocations` in both dialect files and match their conventions exactly.**
- [ ] **Step 2: Add the table to both.** Index on `projectId`. A partial unique index on `(projectId)` where `isPrimary` is true, if the dialects both support it — otherwise enforce single-primary in the service and say so in a comment.
- [ ] **Step 3:** `pnpm vitest run src/db/schema-parity.test.ts --no-file-parallelism` must pass.
- [ ] **Step 4:** `pnpm db:generate && pnpm db:migrate:local`, commit the generated migration.

**`confirmedAt` nullable is the load-bearing column.** A row with `confirmedAt: null` is a _proposal_ and must never change what any tab queries.

---

## Task 3: The detection cascade

**Files:**

- Create: `src/server/features/geo/detectTargetArea.ts` + `.test.ts`

**Interfaces:**

- Produces: `detectTargetArea(input): TargetAreaProposal | null` — PURE. Callers fetch the signals; this only ranks them.

Signals, highest confidence first (per the spec):

1. **Cached Google Business Profile** — `LocalSeoService` already stores `city`, `region`, `latitude`, `longitude`. The business's own declared address.
2. **Search Console evidence** — `getLocalLandingPages` in `projectGscInsights.ts` already finds `/service-areas/plano`-style pages and city-bearing queries.

- [ ] **Step 1: Write the failing tests**

- GBP with city + region ⇒ a proposal sourced `gbp`
- no GBP, GSC local landing pages naming one city ⇒ a proposal sourced `gsc`
- no GBP, GSC naming several distinct cities ⇒ a MULTI-area proposal (the spec: only offer multi-location when detection actually finds several)
- neither signal ⇒ `null`, NOT a fabricated guess
- GBP and GSC disagree ⇒ GBP wins, and the result records that GSC differed so the UI can say so
- a city that maps to no seeded row ⇒ `null` rather than a made-up code

- [ ] **Step 2: Implement, run to green**

Keep it pure. Mapping a city name to a metro requires a `geo_locations` lookup — the CALLER does that and passes candidates in. Do not import a repository here or the test cannot load under `environment: "node"`.

- [ ] **Step 3: Verify and commit**

---

## Task 4: Proposal + confirmation service and server functions

**Files:**

- Create: `src/server/features/geo/repositories/TargetAreaRepository.ts`, `src/server/features/geo/services/TargetAreaService.ts`, `src/serverFunctions/targetAreas.ts`

**Interfaces:**

- `getTargetArea({ projectId })` → the confirmed primary area, or the pending proposal, or null
- `confirmTargetArea({ projectId, area })` → writes `confirmedAt`
- `setTargetArea({ projectId, area })` → manual override from the picker, confirmed immediately
- `clearTargetArea({ projectId })`

- [ ] **Step 1: Read a sibling repository + server function and match their conventions** (`requireProjectContext`, zod validation, error handling).
- [ ] **Step 2: Implement.** Detection runs here, assembling free signals: cached GBP, the GSC report, and a `geo_locations` lookup. **All free — verify nothing reaches a metered provider:**
      `grep -rn "dataforseo" src/server/features/geo/` ⇒ expected: only the seed path, never the target-area path.
- [ ] **Step 3: A proposal is never auto-confirmed.** Add a test asserting `getTargetArea` returns an unconfirmed proposal with a flag the UI can distinguish, and that nothing writes `confirmedAt` without an explicit confirm call.
- [ ] **Step 4: Verify and commit**

---

## Task 5: The confirmation banner and scope control

**Files:**

- Create: `src/client/features/geo/TargetAreaBanner.tsx`, `src/client/features/geo/ScopeControl.tsx`
- Modify: the six affected tabs (see the spec's table): Keyword Research, Keyword Trends, SERP Overview, Content Optimizer, Rank Tracking, Topic Clusters

- [ ] **Step 1: Banner.** Shown once when a proposal exists and is unconfirmed:

> Looks like you serve **Dallas–Ft. Worth, TX** — from your Google Business Profile.
> **[Use this for research]** · Not right?

"Not right?" opens the picker. Dismissing must not silently confirm.

- [ ] **Step 2: Scope control** in each affected tab's header — shows the active area, opens `GeoLocationSelect` to change it. **One control per tab, not per field.**

- [ ] **Step 3: Do NOT add it to** Domain Overview, Competitors, Backlinks, Site Audit, On-Page, Local SEO, Local Rank Grid, or the GSC-derived tabs. The spec explains why: their data is country-level or global, so a metro control there would be a lie.

- [ ] **Step 4: NO-AUTO-SPEND CHECK, MANDATORY.** For each tab:
      `grep -rn "useQuery\|useMutation\|useMeteredQuery" <tab dir>`
      Confirm changing the scope does not fire a metered call. It must only change what the NEXT user-initiated run sends. If selecting an area would trigger a fetch, STOP and report.

- [ ] **Step 5:** `pnpm ci:check`, then commit per tab.

---

## Task 6: Per-metric labels and honest degradation

**Files:**

- Modify: the six tabs' result rendering; `src/client/features/insights/verdicts/*`

- [ ] **Step 1: Labels.** Every metric whose geography can differ carries a suffix — `Volume · DFW`, `Difficulty · US`. Muted, no chips, per the icon rule. Derive from `resolveGeo`'s `scope` and `label`; do not re-compute geography in the view.

- [ ] **Step 2: On-demand difficulty.** Per the spec: local volume by default; Difficulty and Intent render a "Load difficulty for these N" affordance bounded to the current page, stating what it will fetch. One `keyword_overview` call per page, explicit click only.

- [ ] **Step 3: HONEST DEGRADATION — this is the task's real purpose.**

The step-1 spike was never run, so a provider may reject a DMA code. When `resolveGeo` returns `provider: "none"`, or a provider rejects the location, the UI must say so specifically — _"Keyword difficulty isn't available for a metro; showing the national figure"_ — and **never** silently present a national number as local, or a local number as national.

Add tests for: `provider: "none"`, and a provider error surfaced while an area is active.

- [ ] **Step 4: Verdicts state their geography.** `"In Dallas–Ft. Worth, the top results average DR 41…"`, and where a verdict leans on a national figure it says so. This is the same defensibility rule already enforced there.

- [ ] **Step 5:** `pnpm ci:check && pnpm vitest run --no-file-parallelism`

---

## Final verification

- [ ] `pnpm ci:check && pnpm vitest run --no-file-parallelism`
- [ ] `PLAYWRIGHT_CHANNEL=chromium pnpm exec playwright test e2e/insights-visual.spec.ts` — 27 checks must stay green; extend it to cover the scope control and banner.
- [ ] Confirm a project with NO target area behaves exactly as before: `git diff main --stat` should show no behavioural change on the unaffected tabs.
- [ ] Confirm the no-spend boundary: selecting an area, confirming a proposal, and opening the picker must all be free.
