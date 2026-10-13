# FlyRocketSEO product audit

Date: 2026-10-13. Original baseline: `49096606273eaeaeff7b82e49b1a767a48e65eca`. Repair branch: `audit/flyrocketseo-reliability-2026-10-13`.

## Executive finding and scope

The repository contains substantial real implementation, not simply placeholder screens: project-scoped server functions, provider adapters, persisted analyses, crawls, rank-check workflows, and independent dashboard cards. The immediate problem is that availability, error recovery, estimated opportunity value, and navigation are not consistently communicated. A compiling application can still mislead a user or strand them in a loading state.

This is a repository-wide inventory with targeted executable repairs, not a certification that every feature works end to end. The complete source snapshot was obtained through the branch's read-only verification workflow after direct local cloning failed. All project navigation destinations and utility routes were inventoried; the source paths below were inspected to map responsibilities. The Opportunities calculations/page-control branches and project-access recovery received focused execution tests. Native checks and exact test outcomes are recorded in `verification-results.md`. No authenticated production session or real SEO-provider response was exercised.

## Architecture and safeguards to preserve

Frontend: React, TanStack Router/Start/Query, TypeScript, and Kumo components. Entry points are `src/routes/`, `src/client/features/`, `src/client/navigation/items.ts`, and `src/client/layout/AppShell.tsx`.

Backend: TanStack server functions in `src/serverFunctions/`, feature services/repositories in `src/server/features/`, and provider clients under `src/server/lib/`. `src/middleware/ensureUser.ts` resolves the user/organization and verifies project ownership before handlers. `requireProjectContext` narrows that checked context. This design was preserved; code inspection alone is not a penetration test.

Deployment configuration: `wrangler.jsonc` selects hosted authentication, D1, R2, KV, two Workflows, onboarding/SAM Durable Objects, and a 15-minute cron. `src/server.ts` runs scheduled rank checks and a separately caught domain-harvest job. PostgreSQL support exists but is not selected by the checked configuration. Actual deployed secrets, Cloudflare settings, quotas, schedules, and account state remain unverified.

Authentication modes and billing are separate. `src/lib/auth-mode.ts` requires client/server mode agreement. `src/server/billing/config.ts` enables Autumn only for hosted mode with a nonblank secret; subscription checks intentionally allow the private self-host when billing is disabled. Merely finding billing code is not proof of an unwanted subscription gate.

R2 analysis runs can restore saved payloads beyond their soft cache TTL (`analysis-runs/services/analysisRuns.ts`, `src/server/lib/r2-cache.ts`). The DataForSEO transport restricts retries to qualifying GETs and does not replay billable POSTs (`dataforseo/core.ts`). The keyed project Outlet already prevents React state from surviving a project switch. These protections predate this branch and were not claimed as new repairs.

## Confirmed defects and changes

- F01, P0, repaired: Opportunities checked a disabled results query's pending state before recognizing that no completed audit existed. The no-audit call to action was unreachable behind a spinner. `technicalAuditState.ts` now resolves prerequisites first.
- F02, P0, repaired: absent, loading, and empty audit evidence became zero technical findings. These states now remain explicitly unknown; successfully evaluated pages can still legitimately show zero.
- F03, P0, repaired: summing issue-category counts counted the same page repeatedly. The summary now counts distinct exact URLs across all categories, independently of the three-example display limit.
- F04, P0, repaired: failed/unknown fetches could produce missing-title, missing-description, and heading diagnoses. Metadata checks now require a recorded 200 response; failed, redirected, and unverified responses are separate review categories.
- F05, P0, repaired: a successful query with no GSC payload could look like connected zero evidence. Absent payloads now remain unavailable.
- F06, P0, repaired: invalid numeric inputs could create apparent click opportunities. Non-finite impressions/click values and invalid ranking positions are excluded.
- F07, P1, repaired: click scenarios were presented as additive monthly gains despite overlapping evidence and fixed assumptions. The headline now shows the largest single scenario, explains the assumptions, and displays the GSC evidence window. Distinct consolidation actions are not silently discarded.
- F08, P1, repaired: short text, heading counts, redirects, and image alternatives were framed too categorically. The copy now distinguishes review heuristics from confirmed problems and avoids ranking promises.
- F09, P0, repaired: all project-access failures except unauthenticated errors redirected home, including temporary service failures. Only missing/forbidden projects and unauthenticated sessions redirect now; other failures expose a read-only retry. The remembered landing project is updated only after access succeeds.
- F10, P1, improved: 24 destinations were mixed into Research/My Site. They now appear under Overview, Research, Optimize, Track, and Manage; every existing destination is retained exactly once. GSC Insights is labeled Search Performance. This is regrouping, not the completed consolidation/redesign.

## Feature inventory

All suffixes below are relative to `/p/$projectId`. Unless explicitly noted as repaired above, these are source-mapped implementations with live behavior still unverified. A service's existence does not establish that its filters, provider account, or export works in the deployed environment.

- Overview (`/`): `dashboard/ProjectDashboardPage.tsx` composes independent setup, analysis, keyword, GSC, ranking, crawl, and backlink cards. Keep independent error boundaries; replace tool-first ordering with a concise performance/action/results hierarchy in a later increment.
- SEO Opportunities (`/opportunities`): `opportunities/OpportunitiesPage.tsx`, GSC report, link insights, and saved audit pages. Targeted availability/count/estimate repairs and tests are included. Persistent work status and measured outcomes are not implemented here.
- Keyword Research (`/keywords`): `keywords/services/research/` combines discovery, metrics, selection, SERP, and saving. Preserve explicit paid-run authorization and restored analyses. Verify search, filters, sorting, geography, pagination, saving, and project switching against fixtures.
- Saved Keywords (`/saved`): route uses paginated saved research rows. Verify selections, removal, filtering, and refresh without leaking another project's rows.
- Keyword Trends (`/trends`): `trends/services/TrendsService.ts` and associated action/fit models. Keep provider trends distinct from observed GSC performance; consider nesting under Keyword Research.
- SERP Overview (`/serp`): `serp/services/SerpOverviewService.ts` and mapping/geography helpers. Retain standalone advanced access, but make keyword-row drill-down the main entry. Verify device/location/depth and captured date.
- Domain Overview (`/domain`): `domain/services/DomainService.ts`, keyword/page pagination and rank-history services. Estimated traffic is not first-party visits. Existing filter/performance browser suites need authenticated fixture execution.
- Competitors (`/competitors`): `competitors/services/CompetitorsService.ts`. Verify real provider intersections, market context, empty results, and costs; merge with Domain Research at the workflow level rather than deleting the route.
- Backlinks (`/backlinks`): BacklinksService, compare, breakdown, mapping, and history modules. Confirm provider entitlement and null handling. Missing history event fields currently default to zero; see the unresolved integrity finding below.
- Expired Domains (`/expired-domains`): domain-harvest service plus WhoisFreaks/APIVerve adapters. Specialist capability; keep secondary to core SEO workflows. Validate availability independently of expiry dates before recommending acquisition.
- Site Audit (`/audit`, `/audit/issues/$resultId`): AuditService, repository, SiteAuditWorkflow, parser/discovery, and Lighthouse integration. Check crawl coverage, robots handling, redirects, cancellation, capacity, issue filtering, and actual fallback spend on staging. A completed job with no page evidence is not a clean site.
- On-Page Fixes (`/on-page`): OnPageService and OnPageAiService. Require actual captured content, evidence-backed suggestions, and human review. Generating a suggestion does not prove a website was changed.
- Content Optimizer (`/content`): ContentBriefService and content mapping. Treat briefs as drafts; show input pages, capture dates, and absent evidence. Join this to page investigations instead of forcing users to restart context.
- Page Explorer (`/page`): PageExplorerService. Candidate common investigation surface for page content, queries, crawl findings, and internal links. Verify all existing URL input and failure states before reusing it.
- Topic Clusters (`/clusters`): keyword cluster mapping and UI. Keep exploratory clustering separate from verified search-demand or ranking claims. Prefer a tab inside keyword/content planning.
- Link Opportunities (`/links`): `serverFunctions/link-insights.ts`, link models, and link-presence checks. Query overlap alone is not proof that an anchor exists in source content. The current protected fetch path checks organization/site scope, redirect hops, body size, and timeout; preserve it.
- Cannibalization (`/cannibalization`): link-insight data and severity rules. It is a candidate-overlap investigation, not automatic permission to delete or redirect pages. Keep a detailed view but connect it to opportunity evidence.
- Search Performance (`/search-performance`): GSC OAuth/service/client and `serverFunctions/searchPerformance.ts`. Uses separate property/query-page pulls and capped datasets. Verify connection renewal, date filters, previous-period aggregation, exports, and disconnected states.
- Rank Tracking (`/rank-tracking`, `/$configId`): RankTrackingService, run guards, results, digest, scheduler, and RankCheckWorkflow. Verify configured region/device/depth, genuine historical observations, duplicate-run protection, schedule approval, and retry/billing behavior.
- AI Visibility (`/brand-lookup`): brand lookup, tracked snapshots, share-of-voice, cited-source services. The inspected snapshot code already avoids recording fully empty results as zero and filters history to the current domain. Provider sample coverage is not universal AI visibility.
- Prompt Explorer (`/prompt-explorer`): promptExplorer service. Keep inside AI Visibility as an advanced investigation; verify prompt source, geography, sampling, dates, and paid refresh consent.
- Local SEO (`/local`): LocalSeoService, GBP connection/write services, and geo controls. Separate provider-observed listings from authorized first-party GBP data and writes. Actual OAuth permissions and write behavior were not tested.
- Local Rank Grid (`/local-grid`): local grid mapping and scans. Show grid location, spacing, query, scan time, and failed cells; never silently map a failed cell to not-ranking.
- Client Report (`/report`): report UI assembles underlying project sources. It must inherit every source's date/coverage/unavailable state and must not rerun paid research just to export. End-to-end export and print verification remain open.

Other surfaces: project settings and SAM chat; `/projects`, `/settings`, `/team`, `/billing`, `/ai`, `/support`, provider-key help; sign-in/sign-up, password reset, email verification, onboarding, subscription, and OAuth consent; auth, Autumn, GSC and GBP callback API routes; MCP/agent routing and the OpenAI app challenge. These were inventoried, not fully exercised. Do not remove apparently ancillary routes until their auth, callback, or operational dependencies are known.

## Remaining high-priority findings

R01, P0 investigation: `backlinksTimeline.ts` defaults missing new/lost event values to zero, while `domainRankHistory.ts` can compute top-three totals from one missing component. Establish each provider field's null semantics and add missing-field fixtures before changing UI types; neither is repaired in this branch.

R02, P1: AppShell's missing-DataForSEO setup modal is reopened by pathname-dependent effects, including entry into otherwise free workflows. Confirm this in authenticated staging, then replace it with a nonblocking integration-specific status. The current behavior is source-observed, not browser-reproduced here.

R03, P0/P1 investigation: project-local filter state may still be stored under global localStorage keys, as documented by the existing route comment. Audit the actual store keys and migration behavior; a comment is not proof that all current stores remain defective.

R04, P1/P2: the dashboard remains a collection of tool cards, and the main Opportunities list does not persist assignment, implementation dates, evidence versions, or results. The proposed connected workflow and lifecycle are documented separately, not falsely marked implemented.

R05, P0 release gate: provider entitlement, deployed auth configuration, OAuth renewal, account isolation, metered retries, responsive full-app behavior, and all paid routes require controlled authenticated verification. No observed source-level safeguard establishes that the deployed configuration is correct.

## Disposition

Keep existing infrastructure and useful tools. Complete P0 availability/metric/provider-contract tests, then consolidate navigation progressively and build a persisted evidence-to-action lifecycle. Do not rebuild the data stack or buy another provider merely to resemble a competitor. See `data-integrity.md`, `competitive-analysis.md`, the product design documents, and `verification-results.md` for exact boundaries and handoff.
