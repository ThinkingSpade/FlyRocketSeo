# APIVerve Domain Expiration Integration

Date: 2026-08-20
Status: Approved design, not yet implemented

## Problem

The app has no domain-lifecycle data in its UI. A domain's expiry date, its age,
and whether a domain is expired or acquirable are all invisible to a user, even
though age is an authority signal and expiry is a real operational risk.

There is one existing WHOIS path — `fetchDomainWhois` in
`src/server/lib/dataforseo/domain-analytics.ts` — but it is metered through
DataForSEO and reachable only from the SAM/MCP tool `get_domain_whois`. Nothing
in the app renders it.

Separately, the user wants to find **expired domains relevant to a project** as
acquisition targets: given a vending/micromarket operator like deliotx.com,
surface expired domains in that niche worth buying for their link equity.

## Constraint that shaped the design

**APIVerve cannot discover domains.** Verified against their full catalogue:
every domain endpoint they publish — Domain Expiration, Domain Availability,
WHOIS Lookup, DNS Lookup, Subdomain Finder, TLD Lookup — takes a domain the
caller already names. There is no search-by-keyword, search-by-niche, or
drop-date feed.

APIVerve is therefore the **filter**, never the **finder**. Discovery must come
from a candidate generator we own. This design uses the project's existing niche
graph (link gap, competitors, SERP rivals) as that generator, behind a swappable
interface so a real drop-list feed (DomCop, ExpiredDomains.net) can be added
later without reworking the pipeline.

**Honest ceiling, to be stated in the UI:** this finds domains connected to the
project's link or SERP graph. It does not enumerate the expired-.com universe.
A food blog that links to a competing vending operator _will_ be found; an
unrelated expired nutrition domain with no graph connection will not.

## API reference

`GET https://api.apiverve.com/v1/domainexpiration?domain=<domain>`
Header: `X-API-Key: <key>`
Cost: **5 credits per call**. Rate-limited per minute; `429` on exceed, with
`X-RateLimit-Limit` / `-Remaining` / `-Reset` headers.

Success (HTTP 200):

```json
{
  "status": "ok",
  "error": null,
  "data": {
    "domain": "myspace.com",
    "expirationDate": "2029-02-23T05:00:00Z",
    "daysToExpiration": 1164,
    "expirationStatus": "healthy",
    "createdDate": "1996-02-22T05:00:00Z",
    "lastUpdatedDate": "2023-01-17T00:16:21Z",
    "daysSinceLastUpdate": 1064,
    "domainAgeDays": 10890,
    "domainAgeYears": 29.8
  }
}
```

Errors: `400` invalid parameters, `401` missing/invalid key, `403` insufficient
credits, `429` rate limit, `500`/`503` upstream.

`expirationDate`, `createdDate`, `lastUpdatedDate` and `daysSinceLastUpdate` are
documented as premium-plan fields. **This deployment is on a paid plan**, so the
full object is available and the UI may render real dates.

Phase 2 additionally uses APIVerve's **Domain Availability** endpoint. Expiry
alone is not a buy signal: an expired domain sits in redemption/pending-delete
for roughly 75 days and cannot be registered. Availability is what makes a
target actually acquirable.

## Phasing

| Phase | Scope                                                            |
| ----- | ---------------------------------------------------------------- |
| 1     | APIVerve client + KV cache + Domain Overview card + SAM/MCP tool |
| 2     | Expired-domain finder (graph-derived candidates)                 |
| 3     | Audit run metadata + backlinks/competitor column                 |

No phase requires a D1 migration. Phase 1 caches in KV; Phase 2 persists through
the existing `analysisRuns` + R2 run-history pattern. This deliberately avoids
the deploy trap where Workers Builds ships on a push to `main` without ever
running `db:migrate:prod`, so these branches can merge in any order.

## Phase 1 — the primitive

### Modules

- `src/server/lib/apiverve/client.ts` — shared fetch wrapper: base URL,
  `X-API-Key` header from env, 5s `AbortSignal.timeout`, HTTP status → `AppError`
  mapping.
- `src/server/lib/apiverve/domainExpiration.ts` — Zod response schema,
  `fetchDomainExpiration(domain)`, KV cache read/write.
- `src/shared/domainExpiration.ts` — status thresholds and the derive-from-dates
  functions. Shared so server, card, audit and finder agree.
- `src/serverFunctions/domainExpiration.ts` — `getDomainExpiration` (single) and
  `getBulkDomainExpiration` (capped array), both under `requireProjectContext`.

Modelled on `src/serverFunctions/ahrefs.ts`, which is the existing precedent for
a cached external domain-level lookup.

### Decision 1: cache absolute dates, recompute relative ones on read

APIVerve computes `daysToExpiration`, `domainAgeDays` and `daysSinceLastUpdate`
at call time. Caching the response whole means that on day N of the TTL, the
cached day-counts are N days wrong — silently, and in the dangerous direction: a
domain three days from dropping would read as ten.

KV therefore stores only the absolute fields:

```
{ domain, expirationDate, createdDate, lastUpdatedDate }
```

and `daysToExpiration`, `domainAgeDays`, `domainAgeYears` and
`daysSinceLastUpdate` are recomputed from the current clock on every read.

- Key prefix: `apiverve-domain-exp:v1:`
- TTL: 7 days, flat. Adaptive TTL is an explicit non-goal.

### Decision 2: we own the status thresholds

APIVerve names four buckets (`expired`, `critical`, `warning`, `healthy`) but
does not publish the cutoffs. Since the day-counts are recomputed locally,
trusting their string would let status and days drift apart in the same view.

Thresholds live in `src/shared/domainExpiration.ts` and are documented as ours:

| Status     | Condition               |
| ---------- | ----------------------- |
| `expired`  | `daysToExpiration <= 0` |
| `critical` | `<= 30`                 |
| `warning`  | `<= 90`                 |
| `healthy`  | `> 90`                  |

The API's own `expirationStatus` string is parsed but not used for display.

### Decision 3: staleness errs toward false alarms

With absolute dates cached, the only fact a stale entry can miss is a
**renewal**, which pushes `expirationDate` outward. So a stale entry can say
"expiring soon" about a domain that was just renewed — a false alarm. It cannot
miss a real imminent expiry, because a cached date never moves inward. This
asymmetry is why a 7-day flat TTL is safe.

### Decision 4: distinct error codes, no automatic retries

Each HTTP status maps to a specific `ErrorCode` so a failure names itself rather
than surfacing as a generic error:

| HTTP             | `ErrorCode`                  | New?     | Handling                                        |
| ---------------- | ---------------------------- | -------- | ----------------------------------------------- |
| 400              | `VALIDATION_ERROR`           | existing | user-facing                                     |
| 401, key absent  | `APIVERVE_NOT_CONFIGURED`    | **new**  | operator misconfiguration; surface hides itself |
| 401, key present | `APIVERVE_AUTH_FAILED`       | **new**  | mirrors `DATAFORSEO_AUTH_FAILED`                |
| 403              | `APIVERVE_CREDITS_EXHAUSTED` | **new**  | mirrors `MODEL_CREDITS_EXHAUSTED`               |
| 429              | `RATE_LIMITED`               | existing | shown as retryable, not auto-retried            |
| 5xx              | `UPSTREAM_UNAVAILABLE`       | existing | degrades that domain to unknown                 |

The three new codes must be registered in the `ERROR_CODES` tuple in
`src/shared/error-codes.ts`, which backs a `z.enum` and the `ErrorCode` type.

**`INSUFFICIENT_CREDITS` is deliberately not reused for the 403.** That existing
code means the _customer's_ metered balance is empty. An exhausted APIVerve
quota is an _operator_ problem the customer can do nothing about, and conflating
the two would tell a user to top up an account that is not the problem. This is
the same separation `MODEL_CREDITS_EXHAUSTED` already makes for OpenRouter.

**Nothing auto-retries.** This is a metered endpoint, and `useMeteredQuery`'s
`retry` path is the known seam that once billed a failing paid query up to 4×
per click. Every APIVerve-backed query sets `retry: false`.

### Decision 5: `null` means exactly one thing

`null` means "we do not know" — never a fabricated `0`, never a silent collapse
to `healthy`. A failed lookup renders as unknown and is visually distinct from
`expired`. This follows the Ahrefs DR precedent, where collapsing a real `0` to
`null` silently destroyed a ranking verdict.

### Decision 6: missing key hides the feature

`APIVERVE_API_KEY` is read through `getOptionalEnvValue`, so `.env.local` works
in development. When absent, every surface reports "not configured" and hides
itself — the way `OPENROUTER_API_KEY` gates SAM. A user never sees a raw 401.

### Other limits

- Concurrency capped at 5 per batch. Ahrefs' 20 would trip APIVerve's
  per-minute rate limit.
- Hard `MAX_DOMAINS_PER_CALL = 100` on the bulk server function, matching the
  cap `ahrefs.ts` uses and leaving headroom above the finder's default of 50.
- A single domain's failure degrades that domain to unknown; it never fails the
  whole batch.

### Domain Overview card

A card on the existing Domain tab showing expiry date, days remaining, a status
pill, and domain age. **One-click to run, never auto-loading** — the project's
standing no-auto-spend rule. Once cached it re-renders free for 7 days.

### SAM/MCP tool

`get_domain_expiration`, alongside the existing `get_domain_whois`. The
DataForSEO WHOIS tool stays as-is; this design does not replace it.

## Phase 2 — the expired-domain finder

### Candidate sources

```ts
interface CandidateSource {
  readonly name: string;
  readonly metered: boolean;
  collect(ctx: FinderContext): Promise<CandidateDomain[]>;
}

type CandidateDomain = {
  domain: string;
  source: string;
  evidence: CandidateEvidence;
};
```

v1 sources:

| Source        | Origin                             | Metered          |
| ------------- | ---------------------------------- | ---------------- |
| `competitors` | `projectCompetitors` rows in D1    | no               |
| `link-gap`    | `fetchBacklinksDomainIntersection` | yes (DataForSEO) |
| `serp-rivals` | `fetchSerpCompetitors`             | yes (DataForSEO) |

A future `drop-feed` source implements the same interface and requires no
pipeline change.

Phase 2 adds `src/server/lib/apiverve/domainAvailability.ts` on the same client
and cache conventions as `domainExpiration.ts`.

### Normalisation

All candidates collapse to the registrable domain (eTLD+1) via `tldts`, because
that is the unit that can actually be registered. A subdomain cannot expire or
be bought independently, so `blog.example.com` and `example.com` are one
candidate.

### Relevance from graph evidence, not from the domain string

Inferring that `nutritionhub.com` is food-adjacent by reading its name is weak
and unreliable. The strong signal is already known: that domain is in the
candidate set _because_ it links to three of the project's competitors, or
because it ranks for a keyword the project targets. Relevance is scored from
that evidence — competitor-link count, keyword overlap — filtered by
`projectProfiles.exclusions`.

This works with no LLM key set, matching the precedent in
`classifyCompetitorDomain.ts`. Provenance is retained per candidate so each row
can explain why it is there.

### Pipeline

Pure and unit-testable end to end:

1. collect from enabled sources
2. normalise to eTLD+1
3. dedupe, merging provenance — a domain found by two sources scores higher
4. drop the project's own domain
5. strip platforms via the existing `classifyCompetitorDomain`, so Facebook and
   YouTube never appear as acquisition targets
6. rank by relevance
7. cap to N (default 50), ordered so the cap keeps the best
8. APIVerve expiration **and** availability on the capped set
9. filter to expired / critical / warning
10. sort by status severity, then relevance

### Spend gate

Before any APIVerve call the UI states the cost explicitly — "50 domains × 2
calls × 5 credits = 500 credits" — and requires confirmation. The gating state
change resolves in a single transaction, per the established rule for any state
that gates a paid query.

### Persistence and restore

Results write an `analysisRuns` row with an R2 payload, matching the backlinks
and competitors run-history pattern. **Restore is inert**: it renders stored
rows and issues no queries. The specific hazard is that sibling components in
this codebase self-fetch metered data off any non-empty target, so the finder's
rows must not wake the Domain Overview card's lookup or the backlinks DR fetch.

### Empty state

Most domains in a healthy niche graph are alive, so "nothing found" is the
common outcome. The panel must show its work — "Checked 50 domains from link gap
and competitors — none expired" — rather than rendering blank. A finder that
usually returns nothing looks broken unless it reports what it examined.

## Phase 3 — audit metadata and table enrichment

### Audit

`classifyAuditIssues` is page-derived: every matcher takes an `AuditIssuePage`,
and there is no site-level issue channel. Domain expiry is a site-level fact and
will **not** be forced into that vocabulary.

Instead, expiry is recorded as **audit run metadata** and shown in the results
header and the client report. This leaves `classifyAuditIssues` and
`buildAuditVerdict` untouched. Accepted trade-off: it is not an "issue" row and
does not count toward issue totals.

### Backlinks / competitor column

An expiry column beside the Ahrefs DR column. This has the worst cost profile in
the design — a 100-row page is 500 credits — so it is an **explicit per-page
action, never automatic**, gated like the other metered tables.

The shared KV cache means the finder and this table warm each other: a domain
checked by the finder yesterday is free in the table today.

## Testing

- `apiverve/client.test.ts` — mocked fetch: happy path, each error status
  mapping to its own `AppError`, malformed JSON, timeout.
- `domainExpiration.test.ts` — **the cache-drift test**: write a cache entry,
  advance fake timers 7 days, assert `daysToExpiration` returns 7 lower. This is
  the test that catches the Decision-1 bug.
- `shared/domainExpiration.test.ts` — threshold boundaries at exactly 0, 30, 90.
- Finder pipeline tests — dedupe, provenance merging, platform stripping,
  own-domain exclusion, cap-keeps-best-ranked.
- No live API calls anywhere in the suite.
- Top-level imports only in test files. A deferred `await import()` in a test
  body bills the whole module-graph load to the first test as a phantom timeout.

## Rollout

- `APIVERVE_API_KEY` set as a wrangler secret by the operator. Credential entry
  is not automated.
- No D1 migration in any phase, so no pre-merge migration sequencing.
- `pnpm ci:check && pnpm test` before opening each PR. Note that `ci:check` is
  `prettier --check && knip && tsc --noEmit && oxlint --type-aware` — it does
  **not** run vitest, so the test run is a separate command.

## Explicit non-goals

- Replacing the existing DataForSEO `get_domain_whois` tool.
- A drop-list / zone-file feed. The `CandidateSource` interface leaves room for
  one; wiring a second vendor is out of scope here.
- Adaptive cache TTL.
- A site-level audit issue channel.
- Registering or purchasing domains. The finder identifies targets; acquisition
  happens outside the app.
