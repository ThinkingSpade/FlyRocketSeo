# Client Profile Pre-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "About this client" card fill itself in from what the app
already knows, name the client's actual city, and stop its one AI affordance
from failing invisibly.

**Architecture:** Pure mapping functions in `src/shared/keyword-fit/` decide
what the free pre-fill should be; `ProjectProfileCard` composes them with the
target-area hooks it does not currently read. Auto-drafting moves the
write-side into a server function that claims the `project_profiles` row
before doing any work, which is what makes it once-per-project and
concurrency-safe.

**Tech Stack:** TanStack Start server functions, TanStack Query v5, Drizzle
(D1 + Postgres dialects), Vitest, Kumo components.

## Global Constraints

- No metered SEO provider is reachable from any path in this plan. Drafting
  costs exactly one OpenRouter call and one capped 5-page crawl.
- Geography lives in `project_target_areas`, never copied onto
  `project_profiles`. `serviceAreaKind` records shape only.
- An unconfirmed profile (`confirmedAt: null`) must not classify keywords.
- Every schema change lands in BOTH `src/db/app.schema.ts` and
  `src/db/pg/app.schema.ts` with migrations generated for both dialects.
- `useEmailVerificationBypassed`'s resolution formula must not change.
- Files stay under this repo's 400-line ceiling.
- Verify with `pnpm ci:check` (prettier + knip + tsc + oxlint) and
  `pnpm test:ci`. Never judge a piped command by its exit code — `| tail`
  masks it.

---

## Verified findings this plan is built on

Established by observation before planning, not assumed:

1. The production bundle wires the button correctly — the compiled
   `onClick:()=>{o.mutate(void 0,…)}`, `disabled:o.isPending` and the
   `"Reading the site…"` label are all present in
   `assets/keywords-C6DAIjFo.js`. This is not a dead button.
2. `ProfileDraftService.draftFromSite` works end-to-end against a real domain:
   16.1 s against `deliotx.com`, returning a correct profile including
   `serviceAreaKind: "local"`.
3. The draft button does not render at all under `AUTH_MODE=local_noauth`,
   confirmed by opening the card in a browser against the dev server.
4. A drafting error replaces the neutral grey hint with a grey sentence in the
   same position and the same `text-base-content/60` class. There is no
   visual difference between "idle" and "failed".

---

### Task 1: Resolve AI capability in every auth mode

**Files:**

- Modify: `src/client/features/auth/useEmailVerificationBypassed.ts`
- Test: `src/client/features/auth/useEmailVerificationBypassed.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `useAiExplainAvailable(): boolean` and
  `useGbpWriteAvailable(): boolean` now return the live Worker value under any
  `AUTH_MODE`. `useEmailVerificationBypassed` is unchanged in behaviour.

The query is currently `enabled: isHostedMode`, so under `local_noauth` it
never runs and its all-`false` `initialData` is the only value the AI flags
ever see. Drop the `enabled` gate. Split the resolution test: email
verification keeps `!isHostedMode || source === "runtime"` verbatim; the two
capability flags use `source === "runtime"`.

- [ ] **Step 1: Write the failing test** — under a non-hosted auth mode, with
      the runtime config resolving `{aiExplainAvailable: true}`,
      `useAiExplainAvailable()` returns `true`; and
      `useEmailVerificationBypassed().isResolved` is still `true` immediately
      under a non-hosted mode.
- [ ] **Step 2: Run it, confirm it fails** — `pnpm vitest run src/client/features/auth/useEmailVerificationBypassed.test.ts`
- [ ] **Step 3: Remove `enabled`, split `isResolved` into the two tests above.**
- [ ] **Step 4: Run the test file, then the full suite.**
- [ ] **Step 5: Commit.**

### Task 2: A failed draft must not look like an idle one

**Files:**

- Modify: `src/client/features/profiles/ProjectProfileCard.tsx`
- Test: `src/client/features/profiles/draftStatus.test.ts`
- Create: `src/client/features/profiles/draftStatus.ts`

**Interfaces:**

- Produces: `resolveDraftStatus(input: {isPending: boolean; isError: boolean; error: unknown}): {tone: "idle" | "busy" | "error"; message: string}`

A pure resolver rather than three inline ternaries, so the distinction is
testable without rendering. The card renders `tone === "error"` with the
error colour and an alert icon, never the muted hint class.

- [ ] **Step 1: Write the failing test** for the three tones and the message
      each produces, including that an `Error` carrying a bare code string
      maps through `getStandardErrorMessage`.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement `resolveDraftStatus` and use it in the card.**
- [ ] **Step 4: Run tests.**
- [ ] **Step 5: Commit.**

### Task 3: Free pre-fill of service area and brand terms

**Files:**

- Create: `src/shared/keyword-fit/profilePrefill.ts`
- Test: `src/shared/keyword-fit/profilePrefill.test.ts`
- Modify: `src/client/features/profiles/ProjectProfileCard.tsx`

**Interfaces:**

- Produces:
  - `serviceAreaKindForArea(kind: TargetAreaKind): ServiceAreaKind` —
    `city`/`metro` → `"local"`, `region` → `"regional"`, `country` →
    `"national"`.
  - `deriveBrandTerms(input: {projectName: string; domain: string | null}): string`
    — newline-joined, case-insensitively de-duplicated, drops a `Default`
    project name and the domain's public suffix.

The card reads `useTargetArea(projectId)` (already cached by the banner above
it, so this adds no request) and applies these only to fields the user has not
edited and the stored profile has not already set.

- [ ] **Step 1: Write failing tests** for every `TargetAreaKind` and for brand
      terms from `("Delio TX", "deliotx.com")`, `("Default", "deliotx.com")`,
      and a null domain.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement both functions.**
- [ ] **Step 4: Wire into the card; run tests.**
- [ ] **Step 5: Commit.**

### Task 4: Name the city under "Where do they sell?"

**Files:**

- Modify: `src/client/features/profiles/ProjectProfileCard.tsx`
- Create: `src/client/features/profiles/ServiceAreaField.tsx`
- Test: `src/client/features/profiles/serviceAreaSummary.test.ts`
- Create: `src/client/features/profiles/serviceAreaSummary.ts`

Extracted to its own component because `ProjectProfileCard` is already near
the line ceiling and the service-area block now owns a query, a mutation and a
picker.

**Interfaces:**

- Produces: `summariseServiceArea(area: TargetAreaResult): {label: string; state: "confirmed" | "proposed" | "none"; alternatives: string[]}`

- [ ] **Step 1: Write failing tests** for confirmed, single proposal,
      multi-area proposal, and null.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement the summary function.**
- [ ] **Step 4: Build `ServiceAreaField` using it plus `GeoLocationSelect` and
      `useSetTargetArea`; run tests.**
- [ ] **Step 5: Commit.**

### Task 5: Auto-draft once per project

**Files:**

- Modify: `src/server/features/profiles/repositories/ProjectProfileRepository.ts`
- Modify: `src/serverFunctions/projectProfile.ts`
- Modify: `src/client/features/profiles/useProjectProfile.ts`
- Modify: `src/client/features/profiles/ProjectProfileCard.tsx`
- Test: `src/server/features/profiles/autoDraft.test.ts`

**Interfaces:**

- Produces:
  - `ProjectProfileRepository.claimForDraft(projectId): Promise<boolean>` —
    inserts an empty `source: "ai"`, `draftedAt`-stamped, `confirmedAt: null`
    row and returns `true` only for the caller that created it. Later callers
    get `false`.
  - Server function `autoDraftProjectProfile({projectId})` — returns
    `{status: "drafted", profile} | {status: "skipped"}`.

`claimForDraft` relies on the existing
`project_profiles_project_idx` unique index: the insert either wins or
conflicts, which is what makes the claim atomic without a transaction.

- [ ] **Step 1: Write failing tests** — a second concurrent call returns
      `skipped` and performs no crawl; a draft that throws still leaves the
      claimed row so the next mount does not re-crawl; classification stays
      empty while `confirmedAt` is null.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement `claimForDraft` and the server function.**
- [ ] **Step 4: Fire it from the card on mount when the project has a domain,
      has no profile row, and `useAiExplainAvailable()` is true; render the
      review state.**
- [ ] **Step 5: Run tests; commit.**

### Task 6: Feed the profile into the other five surfaces

Independent sub-tasks; each commits on its own.

**Files:**

- Modify: `src/server/features/sam/samSystemPrompt.ts` (+ its test)
- Modify: `src/client/features/content/ContentOptimizerPage.tsx`
- Modify: `src/client/features/topic-clusters/TopicClustersPage.tsx`
- Modify: `src/client/features/report/reportNarrative.ts` (+ its test)
- Modify: `src/routes/_project/p/$projectId/opportunities.tsx`

- [ ] **Step 1: SAM** — extend `SamProjectContext` with the profile fields and
      add a prompt section naming what the client sells and does not do. Test
      that an empty profile adds no section.
- [ ] **Step 2: Commit.**
- [ ] **Step 3: Content Optimizer and Topic Clusters** — mount the collapsed
      card and apply `useKeywordFit` to their suggestion lists.
- [ ] **Step 4: Commit.**
- [ ] **Step 5: Client Report** — open the summary narrative with the client
      description when one is confirmed. Test that it degrades to today's copy
      when absent.
- [ ] **Step 6: Commit.**

## Open question feeding back into Task 2

Why drafting fails in production when it succeeds locally is not yet
established. The leading suspect is the free-plan CPU limit terminating the
five-page cheerio crawl — the wall the site audit already hit — but no
evidence has been gathered yet. Task 2 makes whichever failure it is legible;
if the answer arrives before Task 5 is built, the crawl cost should be reduced
in the same pass (`crawlSiteText` currently parses the homepage twice:
`cheerio.load` in `crawlSiteText` and again inside `toPage`).
