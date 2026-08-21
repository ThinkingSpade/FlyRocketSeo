# Harvest Reach and Grading Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adjacent vocabulary, deleted-domain harvesting, and free DR
grading broad, retry-safe, and operationally bounded.

**Architecture:** Keep parsing, matching, retry classification, and grading
orchestration in Worker-runtime-free modules with injected I/O. Repositories
provide atomic claims; server functions adapt Worker bindings; the React panel
invokes only explicit actions.

**Tech Stack:** TypeScript, Vitest, TanStack Start/Query, Drizzle ORM,
Cloudflare D1, Postgres, OpenRouter AI SDK.

**Spec:** `docs/superpowers/specs/2026-08-21-harvest-net-and-grading-design.md`

## Global Constraints

- Keep medium reasoning, usage accounting, the ZDR provider order, and
  `minimax/minimax-m3` for adjacent terms.
- Only HTTP 401 plus exact message `You cannot download file.` is permanent.
- TLDs are exactly `com`, `net`, `org`, and `co`; daily cap is 450.
- Keep one 50-query Free-plan budget constant and derive harvest/grading sizes.
- Each expired-domain cron tick harvests at most one fairly rotated project or
  grades one batch, never both; rank checks use a separate trigger invocation.
- Grade at most eight rows per invocation, newest first, concurrency three,
  three attempts.
- Keep 15-row inserts and at most 100 D1 bound parameters.
- `null` means unknown; paid work requires an explicit click.
- Vitest imports no module that statically imports `cloudflare:workers`.
- Generate additive D1/Postgres migrations but do not apply them remotely.

---

### Task 1: Adjacent-term response and cache safety

**Files:**

- Modify: `src/server/features/expired-domains/adjacentTerms.test.ts`
- Modify: `src/server/features/expired-domains/adjacentTerms.ts`
- Modify: `src/server/features/expired-domains/harvestVocabulary.test.ts`
- Modify: `src/server/features/expired-domains/harvestVocabulary.ts`

**Interfaces:** Produces strict whole-response trace rejection, pinned M3
request options, and a v2 vocabulary payload with a legacy reader.

- [ ] Add failing tests for a realistic `<think>` blob, whitespace response,
      pinned model/options, reasoning headroom, no-cache-on-empty, v2 reads/writes,
      legacy arrays, and null categories.
- [ ] Run the two focused Vitest files and confirm failures are caused by the
      missing behavior.
- [ ] Build the adjacent model with the explicit M3 slug, request about 1,500
      output tokens, reject trace-shaped replies, and log finish reason/text length
      for empty visible text.
- [ ] Write `{ terms, categoryByTerm }`, fall back to v1 arrays, and normalize
      absent/null categories to `uncategorised`.
- [ ] Re-run the focused tests.

### Task 2: Permanent feed skips and four-TLD harvesting

**Files:**

- Modify: `src/server/lib/whoisfreaks.test.ts`
- Modify: `src/server/lib/whoisfreaks.ts`
- Modify: `src/server/features/expired-domains/domainHarvest.test.ts`
- Modify: `src/server/features/expired-domains/domainHarvest.ts`
- Modify: `src/server/features/expired-domains/manualDomainHarvest.test.ts`
- Modify: `src/server/features/expired-domains/manualDomainHarvest.ts`
- Modify: `src/server/features/expired-domains/repositories/HarvestedDomainRepository.ts`
- Modify: `src/server/features/expired-domains/services/scheduledDomainHarvest.ts`
- Modify: `src/serverFunctions/domainHarvest.ts`

**Interfaces:** Produces a typed permanent-date error, atomic `skipRun`,
`skippedRuns`, separate response dates, one compiled matcher per project, and
shared-stream cancellation only when all matchers are full.

- [ ] Add failing tests proving only the exact 401 body is permanent; bad-key
      and transient responses retry.
- [ ] Add failing orchestration tests for skip persistence, separate response
      dates, four TLDs, the 450 ceiling, and shared-stream cancellation.
- [ ] Parse the response body once, carry the typed permanent signal through the
      injected stream, complete the owned claim with `skip_reason`, and release
      all retryable failures.
- [ ] Change both feed adapters to the four approved TLDs and retain streaming,
      the compiled alternation, and 15-row insert chunks.
- [ ] Re-run WhoisFreaks, vocabulary matcher, harvest, and manual-harvest tests.

### Task 3: Atomic bounded DR grading

**Files:**

- Create: `src/server/features/expired-domains/domainRatingGrading.test.ts`
- Create: `src/server/features/expired-domains/domainRatingGrading.ts`
- Modify: `src/server/features/expired-domains/repositories/HarvestedDomainRepository.ts`
- Modify: `src/server/features/expired-domains/services/scheduledDomainHarvest.ts`

**Interfaces:** Produces atomic attempt claims and an injected grading
orchestrator capped at eight / concurrency three.

- [ ] Add failing tests for newest-first selection, at-most-eight calls,
      concurrency three, attempt ceiling three, overlapping claims, real zero,
      unknown null, and one aggregated failure log.
- [ ] Implement the pure concurrency worker and an update/returning repository
      claim that increments attempts atomically.
- [ ] Route scheduled grading through the shared service and re-run tests.

### Task 4: Explicit free Grade now action

**Files:**

- Modify: `src/serverFunctions/domainHarvest.ts`
- Modify: `src/client/features/expired-domains/HarvestedDomainsPanel.tsx`
- Add focused server/client behavior tests where existing boundaries allow.

- [ ] Add a failing test proving grading has no APIVerve/billing/availability
      dependency and no grade work runs on mount.
- [ ] Wire the action to the shared free grading service in sequential
      eight-domain HTTP requests, refresh after each batch, report remaining
      rows, and provide progress plus cancellation.
- [ ] Re-run focused tests and type checking.

### Task 5: Additive dual-database migrations

**Files:**

- Modify: `src/db/app.schema.ts`
- Modify: `src/db/pg/app.schema.ts`
- Create: next generated D1 and Postgres migrations and metadata snapshots.

- [ ] Add `domain_rating_attempts` with non-null default zero and nullable
      `skip_reason` in both schemas.
- [ ] Generate migrations in sequence and inspect that their SQL is additive.
- [ ] Do not run a migration-apply command.

### Task 6: Integrated verification and review

- [ ] Run all focused regression files.
- [ ] Run `pnpm ci:check` and read its complete exit output.
- [ ] Run `pnpm test` and read its complete exit output.
- [ ] Inspect `git diff --check`, generated SQL, Worker import boundaries, D1
      bind counts, and explicit-click spend paths.
- [ ] Request whole-branch review and resolve critical/important findings.

### Task 7: Free-plan invocation budgeting

**Files:**

- Create: `src/shared/workerQueryBudget.ts`
- Create: `src/shared/workerQueryBudget.test.ts`
- Create: `src/server/features/expired-domains/scheduledDomainHarvestPolicy.ts`
- Create: `src/server/features/expired-domains/scheduledDomainHarvestPolicy.test.ts`
- Modify: `src/server/features/expired-domains/services/scheduledDomainHarvest.ts`
- Modify: `src/server.ts` and `wrangler.jsonc`

- [ ] Prove with three capped projects that one invocation selects exactly one
      harvest and remains within the 50-query budget.
- [ ] Derive the 450-match and eight-domain limits from the one plan constant.
- [ ] Select the oldest pending project/date with deterministic tie rotation.
- [ ] Run grading only on ticks with no pending harvest.
- [ ] Separate rank-check and expired-domain Cron Triggers.
