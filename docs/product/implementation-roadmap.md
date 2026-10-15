# FlyRocketSEO implementation roadmap

Date: 2026-10-13. Original baseline: `49096606273eaeaeff7b82e49b1a767a48e65eca`.
Branch: `audit/flyrocketseo-reliability-2026-10-13`.

## Goal and boundaries

Preserve the existing React/TanStack/Cloudflare architecture, project-scoped authorization, explicit paid-request consent, and saved analysis reuse. No deployment, main merge, production data mutation, paid subscription, or infrastructure migration is authorized by this branch.

The continuation implements the first-party dashboard, page investigation and persisted opportunity lifecycle described below. It does not certify live integrations or authorize release. The current execution ledger is `implementation-checklist.md`; exact verification outcomes are in `../audits/verification-results.md`.

## Remaining-roadmap continuation on 2026-10-13

The continuation from `bb93af37` repairs the remaining consumed-field contracts for keyword/Labs research, competitor/gap/bulk comparisons, SERP/rank tracking, local profiles/reviews/grids, AI visibility, Prompt Explorer and page/content research. Contracts cover SDK envelopes, billed failures, missing versus zero, partial observations, declared scope, cache identity, original capture, restored data, chart gaps, defensible derived claims and exported precision/provenance. See the family coverage registers in `../audits/` for concrete boundaries and primary field definitions.

Rank runs and keyword estimates now persist their captured scope in additive D1/PostgreSQL migrations. Real PostgreSQL exposed numeric `SUM` results arriving as strings; production query mapping now preserves numeric outputs. All 24 PostgreSQL migrations apply/replay and 17 isolated runtime cases pass on PostgreSQL 17.11. Latest local application/test source `ff2e0530` passes 3,825 native tests in 398 files. Final formatting, unused-code, TypeScript, type-aware lint, production build, root prerender, SPA shell and startup bundle checks pass. Its complete fresh-state authenticated application suite passes all 83 cases in 21 files, with zero retries, unexpected failures, flaky cases or skips; exact artifacts and finite fixture boundaries are recorded in the execution ledger. Frozen source `3ece2362` also passes inspected Linux audit and Docker PostgreSQL CI; those earlier results are not relabelled as current-source CI.

Final repairs accept the provider's documented 40102 empty SERP metadata while rejecting missing, malformed and foreign-scope observations with their billing evidence. Citation shows its original source, capture, market/language/device and exact query through cache reuse and free restoration. The same direct cold-route browser case exposed a GSC initialization failure; a traced false circular import is removed by loading the request helper inside its sole existing authenticated OAuth handler. Strict browser RED/GREEN, complete suites and independent review support these repairs.

The user subsequently authorized deploying the completed repairs. Release commit `2d2676f3` is published and Cloudflare version `f6e341e3` serves 100% of production traffic. Six reviewed additive D1 migrations applied; all 50 committed migrations are recorded and the three older harvest entries remain. Public HTTP and settled browser sign-in/email-form smoke checks pass. Exact commit/build/version linkage, recovery metadata and remaining live-integration limits are recorded in `../audits/publication-gate.md`. No merge, rollback, new paid service or real paid provider call was performed. Live authenticated provider/OAuth and deployed job/storage acceptance remain blocked.

Actual browser reproductions also repaired late Local SEO prefill overwriting a user's draft, restored Content Optimizer briefs losing their explicitly authorized outline action, and Backlinks Search accepting another submission while its real request was pending. The restored outline action now binds consent to its specific captured brief/run/URLs; selecting another saved brief cannot carry that approval forward. Paid requests still require explicit action; restoration remains free. No new paid dataset or provider was introduced.

The earlier continuation counts below are historical. Current provider scope is the fields consumed by existing application paths, including useful legacy restoration; unused SDK fields and future dataset-dependent intelligence are not certified. Live OAuth/provider access, deployed jobs/storage and approved production migration/release remain external gates.

## Continuation implemented on 2026-10-13

- Provider history preserves unknown fields, partial buckets and unsupported event periods, with versioned scoped caches and original capture dates (`b775587e`).
- Exact-page GSC observations preserve property/connector, target, country, device, search type and equal date windows. Market preferences are project scoped (`eb3377fe`).
- Missing paid-provider setup is optional. Primary workflows and related-tool tabs retain every existing deep link. Trends discovery now requires explicit metered consent, including navigation, reload and restored results.
- Overview shows independent performance, next actions, recorded changes, and persisted progress/results. Page Investigation combines exact-page observations, matching stored crawl evidence, reviewed action preparation and the existing provider-research view.
- Tenant/target-scoped D1/PG schemas, immutable evidence, assignment, notes, revision checks, stable dedupe and append-only work history support decline investigations and contextual internal links (`fbb1dfa0`). Result observations require aligned complete periods, Pacific calendar boundaries, and a seven-day lag. Insufficient outcomes remain pending; measured outcomes describe association.
- A separate hosted-auth application acceptance runner uses isolated local D1/R2/KV, two accounts/organizations and provider fixtures. It never loads the developer's provider credentials or calls production. The branch CI now includes this application suite.

Live OAuth/provider access and deployed workflow recovery remain blocked: the user confirms no staging access is available. SQL migrations were reviewed and exercised locally, not applied to production. This earlier increment passed 22 PostgreSQL migrations and 14 runtime cases; the current continuation above adds scope migrations and coverage. Manual R2 orphan/deleted-project cleanup, durable writer fencing and retry recovery are implemented and tested with isolated data. Production migration and deployed storage/runtime behavior still require approved release verification; bounded history pagination is implemented.

## Inherited implemented increment

Opportunities now resolves audit prerequisites before dependent pending states, distinguishes missing/empty/failed evidence from genuine zero findings, counts unique affected URLs, avoids metadata diagnoses from failed captures, rejects invalid numeric scenarios, and presents nonadditive click scenarios with explicit assumptions.

Navigation retains all 24 destinations under Overview, Research, Optimize, Track, and Manage. Project-access failures are retryable unless they are definitive authentication/authorization or missing-project errors. Previously implemented server authorization and project-remount safeguards remain intact.

Regression coverage includes native Vitest tests, controlled component/route contracts, and isolated Chromium computation checks. A branch-only workflow runs locked installation, static checks, the full unit suite, and a production build without deployment. An initial logging pipeline masked a formatting failure; explicit Bash pipefail and corrected formatting are required before relying on its final status. Consult `../audits/verification-results.md` for exact tested commits and outcomes, not an earlier green badge.

## Roadmap and remaining verification, ordered by priority

### P0: Provider and evidence contracts

Impact: high. Complexity: medium per provider family. Dependencies: representative successful, partial, empty, missing-field, stale, and failed provider fixtures; tenant-scoped test projects.

Start with `backlinksTimeline.ts` new/lost events defaulting absent values to zero and `domainRankHistory.ts` partial top-three buckets. Establish documented semantics before changing types. Then extend the metric register field by field, including exports, saved runs, cache identity, and captured dates. Acceptance: unknown stays unknown; genuine zero remains zero; no synthetic history; project, account, target, market, device, and time window remain consistent.

Status: the named history, first-party page and remaining consumed-field contracts are implemented and fixture verified. The keyword/Labs, rank/local, AI/backlink and page/content coverage registers describe the SDK/service/cache/render/export evidence. Downloaded export checks assert original source, capture, target, market, window, paging and coverage values as well as precision and unknown-versus-zero cells. Live entitlement and actual provider responses remain blocked; unused provider fields are outside the application contract.

### P0: Authenticated workflow acceptance

Impact: high. Complexity: large across the product. Dependencies: an existing isolated staging environment, test accounts, provider mocks or explicitly approved spending, and OAuth test access.

Exercise every inventoried tool through navigation, search, filters, sorting, loading, errors, empty states, restored results, and exports. Test two organizations and two projects, revoked access, expired sessions, project switching, paid-request confirmation, and background-job recovery. Acceptance: no cross-project leakage, duplicate paid requests, silent redirects on transient errors, or successful-looking missing data.

Status: real local hosted authentication, investigation/work/results, research, applicable tool operations, exports, consent and authorization failures are exercised with isolated fixtures. `../audits/tool-operation-coverage.md` distinguishes all 24 destinations' operation evidence from navigation checks and explicitly marks controls that do not exist. Final integrated execution counts are in the ledger. Real OAuth renewal, provider responses and deployed job recovery are blocked without staging access.

### P1: Nonblocking onboarding and progressive navigation

Impact: high. Complexity: small/medium. Dependencies: authenticated browser reproduction of AppShell's pathname-driven missing-provider modal.

Keep free connected-site workflows usable without mandatory DataForSEO setup. Consolidate overlapping tools into tabs/drill-downs while retaining existing deep links. Validate keyboard focus, mobile navigation, active-state labels, and context retention. The current regrouping is not the end of the UX work.

Status: optional onboarding, progressive sidebar and related-tool navigation are implemented; application desktop/mobile coverage is recorded in the ledger. A human task-based usability review remains useful.

### P1: Dashboard and unified page investigation

Impact: high. Complexity: large. Dependencies: consistent source envelopes, date scopes, and partial-source states.

Implement the proposed performance/actions/changes/results dashboard from `ux-redesign.md`. Reuse independent cards and existing Page Explorer, GSC, audit, and content services rather than creating a single fragile fetch waterfall. Acceptance: users can investigate a specific page, see supporting evidence, choose an action, and retain context without restarting research.

Status: implemented using the existing independent services and routes, including scope-preserving action handoffs and unknown/partial evidence displays.

### P2: Persisted opportunity lifecycle

Impact: high. Complexity: large. Dependencies: reviewed tenant-scoped schema changes, evidence retention policy, and deterministic detector contracts.

Implement `opportunity-engine.md`: stable deduplication, versioned evidence snapshots, defensible priority/confidence, reviewed recommendations, persistent progress, and comparable before/after observations. Add decline recovery and content-aware internal linking first. Acceptance: reruns do not duplicate tasks or erase progress; disappearing evidence is not called a fix; outcomes distinguish correlation from causation.

Status: the first decline/internal-link lifecycle is implemented with SQLite/service/browser verification. Automatic implementation, additional detector families, prior-year/controlled causal analysis and multiple implementation cycles per saved action are outside this first version. Manual retention cleanup is implemented and locally verified; production migration, deployed retention behavior and release approval remain gates.

### P3: Dataset-dependent intelligence

Impact: conditional. Complexity: large. Dependencies: verified provider coverage, explicit cost approval, and demonstrated user demand.

Evaluate competitor gaps, wider historical analysis, and AI/local visibility expansion. Own-site crawling and GSC cannot substitute for global competitor/backlink datasets. No new paid provider is assumed.

## Reproduction and release gate

The initial complete source was obtained through a GitHub Actions artifact after direct local downloads failed. The current checkout runs native dependency-backed verification, a real disposable PostgreSQL engine and the actual authenticated application locally. Branch workflows provide an additional Linux/browser and Docker PostgreSQL gate when executed.

From a complete checkout: `pnpm install --frozen-lockfile`, `pnpm run ci:check`, `pnpm test`, `pnpm run build`, `node --test scripts/audit/verify-opportunities.mjs`, and `node scripts/audit/verify-project-access.mjs`. Run the existing authenticated Playwright suites only against isolated test data with authorized credentials. No deployment command is necessary merely to inspect or test this branch.

Release review: use the current checklist and exact verified commit, arrange isolated staging/OAuth/provider access for the blocked live checks, and review the additive migrations and storage/runtime configuration before requesting deployment approval. Do not merge or deploy on the strength of fixture tests alone.
