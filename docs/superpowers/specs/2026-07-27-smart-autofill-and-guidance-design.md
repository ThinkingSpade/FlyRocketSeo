# Smart autofill and per-tab guidance

**Date:** 2026-07-27
**Status:** Approved design, ready for planning

## Problem

Two gaps, both visible on every project tab.

**Autofill is nearly absent.** A suggestion engine already exists —
`useSeedSuggestions` in `src/client/features/dashboard/SeedKeywordField.tsx` —
ranking free seeds from Search Console and the project's saved keywords, each
carrying the number that justifies it. It is used in exactly one place: the
dashboard's Analyze card. `AnalyzeDomainPrompt` prefills the project domain on
six domain-shaped tabs. The six keyword-shaped tabs — SERP Overview, Content
Optimizer, Keyword Trends, Topic Clusters, Keyword Research, Prompt Explorer —
still open as bare boxes with hardcoded placeholders such as
`"office coffee service dallas"`. They know nothing about the project they sit
inside.

**Guidance is confined to the report.** `reportNarrative.ts` writes defensible
plain-English interpretation from numbers already fetched, with no model call.
`opportunityModel.ts` ranks actions by clicks at stake. Both are good; both are
reachable from exactly one tab each. Every other tab is dense data with no
verdict — SERP Overview shows DR, domain traffic and CTR-curve click estimates,
but never says whether the keyword is winnable or what it would take.

A third defect underlies the first: `mapProject` in
`src/server/features/projects/services/projects.ts` returns only `id`, `name`,
`domain` and `createdAt`. The projects table carries `locationCode` and
`languageCode`, set during onboarding, and every tab then hardcodes US/2840
anyway. Market autofill is impossible until that field is plumbed through.

## Approach

A shared client-side engine with small per-tab adapters, plus one narrow
server-side slice for the opt-in AI button.

Rejected alternatives:

- **Grow `reportNarrative.ts`.** It emits client-facing paragraphs; tabs need
  ranked action items with links and numbers. One module serving two audiences
  serves neither.
- **Server-side insights endpoint for everything.** Every input is already in
  the client's react-query cache, and the verdict depends on the result the tab
  currently renders. Computing it server-side would re-fetch data the browser
  already holds. The AI button is the sole exception, because
  `OPENROUTER_API_KEY` is server-side only.

## Architecture

New module, `src/client/features/insights/`:

```
insights/
  suggestionModel.ts        pure: (freeData, intent) -> ranked SeedSuggestion[]
  suggestionModel.test.ts
  useProjectSuggestions.ts  hook: assembles free data, memoizes, calls the model
  verdictModel.ts           pure: (tabResult) -> { read, tone, actions[] }
  verdictModel.test.ts
  NextStepsCard.tsx         UI: verdict line + ranked actions
  SuggestionChips.tsx       UI: generalized from SeedKeywordField
  handoffStore.ts           sessionStorage cross-tab carry
  handoffStore.test.ts
```

### The free-data contract

`useProjectSuggestions` may read only these five sources. All are query keys the
app already populates, so the suggestion layer adds zero network requests and is
structurally incapable of triggering a metered call — the same guarantee
`useAutoRestoredRun` documents.

| Source | Query key | Provides |
| --- | --- | --- |
| `getSearchPerformanceReport` | `["searchPerformance", id, "overview", "last_28_days"]` | `queryTotals`, `pageTotals`, `strikingDistance`, `ctrOpportunities` |
| `getSavedKeywords` | `["savedKeywords", id, ...]` | user's own list with volumes |
| `getProjects` | `["projects"]` | domain, `locationCode`, `languageCode` |
| `getAuditHistory` / `getAuditResults` | `["auditHistory", id]` | crawled pages, issue counts |
| `restoreLatestRun` | `["analysisRun", "latest", id, feature]` | last-run memory, R2-backed |

Adding a sixth source to this list is a design change, not an implementation
detail. The contract is what keeps the layer free.

## The suggestion layer

Five intents, each a pure ranking function over the free data:

| Intent | Ranks by | Feeds |
| --- | --- | --- |
| `striking-distance` | position 4–20, descending impressions | SERP Overview, Rank Tracking |
| `under-clicked` | high impressions, CTR below the curve for that position | Content Optimizer, On-Page Fixes |
| `high-volume` | descending search volume (saved) or impressions (GSC) | Keyword Research, Keyword Trends |
| `topic-gap` | queries with impressions but no owning page | Topic Clusters |
| `own-pages` | descending clicks; page URLs rather than keywords | Page Explorer |

Every suggestion carries the number that justifies it — `"pos 7 · 2.4k impr"` —
never a bare word. `SeedKeywordField` already enforces this; `SuggestionChips`
generalizes it.

### Precedence

When several sources could fill one field, the first non-empty wins:

1. URL search param — explicit and shareable, always wins
2. Cross-tab handoff — set less than 30 minutes ago, same project
3. Last-run memory — from `analysis_runs` for this tab
4. Top per-tab suggestion — the intent ranking above
5. Project default — domain, `locationCode`, `languageCode`
6. Nothing — the field stays empty and chips are still offered

**Filling a field never triggers a fetch.** Prefill puts a value in the box; the
user still presses Analyze. Sibling components self-fetching off a non-empty
target is precisely how auto-restore leaked money before, so before wiring any
prefill, grep the subtree for `useQuery` and confirm nothing self-fetches.

### Cross-tab handoff

`handoffStore.ts` follows the `useSearchTabs` precedent: sessionStorage,
`useSyncExternalStore`, project-scoped key, corrupt data treated as empty. It
stores `{ keyword | domain | url, locationCode, source, at }`, written when a tab
runs an analysis, with a 30-minute TTL so a stale keyword does not haunt the next
session.

### Competitor and market autofill

Competitor-domain fields prefill from the last `getCompetitorsList` run, already
in `analysis_runs` and free to restore. Location selects prefill from
`project.locationCode` rather than the hardcoded `2840` in `AnalyzeProjectCard`,
SERP Overview and Keyword Trends.

## The guidance layer

One pure function per tab in `verdictModel.ts`, all returning the same shape:

```ts
type Verdict = {
  /** One sentence. What the data says. Never advice. */
  read: string;
  tone: "good" | "mixed" | "bad" | "unknown";
  actions: Action[];
};

type Action = {
  /** Imperative. "Rewrite the title on /coffee-water", not "consider rewriting". */
  label: string;
  /** The number that justifies it. "1,240 impressions at 0.4% CTR" */
  evidence: string;
  /** Optional route to where the work happens. */
  to?: { tab: string; params?: Record<string, string> };
  /** Ranked by this. Clicks where derivable, otherwise a fixed tier. */
  weight: number;
};
```

Three discipline rules, inherited from `reportNarrative.ts`:

1. Every sentence must be defensible from the data passed in. No model call, no
   invention.
2. Thresholds are named constants with comments, never magic numbers inline.
3. When there is not enough data, return `tone: "unknown"` with an honest read —
   *"Only 3 queries have impressions; there isn't enough traffic yet to call
   this."* Never fabricate advice to fill the card.

Representative output:

- **SERP Overview** — *"Top 10 averages DR 58; your domain is DR 12. This keyword
  is out of reach directly."* Action: target a long-tail variant drawn from the
  People Also Ask block, noting that 3 of the top 10 are forum posts.
- **Backlinks** — *"41 backlinks point at URLs that no longer resolve."* Action:
  redirect those targets; highest weight, because it is free.
- **Site Audit** — *"18 of 47 pages are missing meta descriptions, 6 of them in
  your top 10 by clicks."* Action links into On-Page Fixes filtered to those 6.
- **Competitors** — *"3 competitors rank for 200+ keywords you don't."* Action
  names the specific keyword to start with and why.

### Inline row-level annotations

The same model at row granularity: a `rowNote(row) => string | null` per table.
SERP rows get *"needs DR 45+"*; audit issues get the literal fix; keyword rows
get why they are reachable. Rendered as muted text under the cell, with no chips,
per the project's icon rule.

### Placement

`NextStepsCard` renders directly under the results block, above any raw table.
Not in the empty state: an empty tab has nothing defensible to say.

## The opt-in AI slice

Modelled on `OnPageAiService.ts`, which already gates on
`getOptionalEnvValue("OPENROUTER_API_KEY")`, bounds work to one call, and returns
a specific error when the key is missing.

One new server function, `explainFindings`:

```
input:  { projectId, tab, verdict, evidence }
output: { prose: string, model: string }
```

Five constraints:

1. **The model never sees raw API payloads.** It receives the deterministic
   verdict and its evidence numbers and nothing else. It is a rewriter, not an
   analyst — hallucinated numbers are structurally hard because no other numbers
   are in the prompt.
2. **Never auto-runs.** Rendered as an "Explain this in plain English" button
   under `NextStepsCard`. Zero calls until clicked.
3. **Hidden when unavailable.** An `aiExplainAvailable` flag joins
   `getClientRuntimeConfig`, which already carries `emailVerificationBypassed`
   through the root loader. No key means no button, rather than a button that
   errors.
4. **Cached by content hash**, keyed on `(projectId, tab, hash(verdict))`.
   Re-clicking an unchanged result costs nothing.
5. **Labeled and subordinate.** AI prose renders below the deterministic actions
   and is visibly marked as AI-written. The rules-based verdict is always the
   primary artifact; if the AI call fails, the tab loses nothing.

Cost is one bounded call per click, metered through the existing OpenRouter usage
accounting (`usage: { include: true }`) against the shared pool, the same meter
as SAM and on-page rewrites.

`OPENROUTER_API_KEY` is currently unset in the deployment, so the AI button ships
dark: code complete, invisible until the key is set. The deterministic layer does
not depend on it.

## Wave 1 scope — nine tabs

| Tab | Autofill | Verdict says | Inline notes |
| --- | --- | --- | --- |
| SERP Overview | `striking-distance`, handoff, project location | Whether the keyword is winnable given the DR spread | "needs DR 45+" per row |
| Content Optimizer | `under-clicked` | Which existing page to fix first, and why | — |
| Keyword Research | `high-volume`, last-run | Which of these are actually winnable | reachability per row |
| Keyword Trends | `high-volume`, project location | Seasonality — when to publish | peak month per series |
| Topic Clusters | `topic-gap` | The gap worth building a hub around | — |
| Domain Overview | project domain, location | Where traffic concentrates and what is at risk | — |
| Backlinks | project domain, last-run | Broken links to recover, spam risk | recoverable flag per row |
| Competitors | project domain, competitor autofill | Which competitor to actually chase | keyword-overlap note per row |
| Site Audit | project domain | Which issues touch the highest-traffic pages | literal fix per issue |

Shared plumbing: `mapProject` gains `locationCode` and `languageCode`; the
hardcoded `2840` in `AnalyzeProjectCard`, SERP Overview and Keyword Trends is
replaced by the project's own market.

## Testing

- `suggestionModel.test.ts` — per intent: correct ranking, empty input, missing
  Search Console, tie-breaking.
- `verdictModel.test.ts` — per tab: good, mixed, bad and unknown tones, and
  specifically that thin data yields `unknown` rather than invented advice.
- `handoffStore.test.ts` — TTL expiry, project scoping, corrupt sessionStorage.
- A precedence test covering the six-level chain with sources present and absent.
- Existing suites stay green. `ci:check` must pass before any claim of
  completion.

## Error handling

- Any free source failing drops out of the ranking. A missing Search Console
  connection degrades to saved keywords, then to nothing — never an error state.
  Suggestions are a convenience and must never break a tab.
- Corrupt sessionStorage is treated as empty, following `useSearchTabs`.
- `verdictModel` returning `unknown` is a normal outcome, rendered honestly.
- A failed `explainFindings` call leaves the deterministic verdict intact.

## Out of scope

- Empty-state teaching.
- Rolling per-tab findings into the SEO Opportunities tab.
- Wave 2 tabs: Page Explorer, Rank Tracking, On-Page Fixes, Local SEO, Local Rank
  Grid, AI Visibility, Prompt Explorer.
- Any change to what the metered endpoints fetch.
