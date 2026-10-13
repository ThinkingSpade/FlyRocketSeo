# Authenticated tool operation coverage

Branch: `audit/flyrocketseo-reliability-2026-10-13`.

This matrix distinguishes operation checks from the 24 destination landing
checks. The acceptance browser uses the actual hosted authentication,
authorization, TanStack handlers, application services, local D1 and R2.
Declared provider HTTP fixtures replace external responses at the SDK transport;
they do not replace whole application RPCs. Keyword/Domain dev fixtures remain
explicit exceptions, with separate native SDK/service contracts. Google Search
Console uses a test-only adapter; its property selection and downstream services
still use real local storage. Fault cases deliberately return a local 503.

The fixture DataForSEO key is public, fake and restricted to the acceptance
configuration. Undeclared hosts, endpoints, methods and credentials are rejected.
Six native boundary tests exercise those restrictions. Billing is disabled for
these isolated fixtures. This does not verify paid billing, provider entitlement,
OAuth, staging or production configuration.

Provider submit cases hold the actual server-function request long enough to
check that its original connected DOM control is disabled, then release it to
the real handler. They preserve the controller/service/provider/storage path;
the held request does not replace an application response. Content history
selection has a separate consent regression case with two persisted briefs and
different competitor URL sets. Twelve native identity cases cover its immediate
project, selected-run, capture, market and URL authorization boundary.

`N/A` means the product has no such control or export. It does not mean the
behavior passed a test. The named cases are defined; final execution status is
recorded below after a fresh-state run, rather than inferred from their existence.

| Destination         | Actual operation cases                                                                        | Search, filters and sorting                                                | Storage / restore                                                                | Export                                                        | Failure and empty state evidence                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Overview            | `application.spec.ts`: independent dashboard cards and action handoffs                        | Work status filter; other dashboard sort N/A                               | Persisted work and independent observations                                      | N/A                                                           | Independent source failures; no provider modal                                                                |
| Keyword Research    | `research.spec.ts`, `keyword-operation-contract.spec.ts`, `keyword-draft.spec.ts`             | Search, include/exclude, volume sort, empty filter                         | Save unknown/zero metrics with original capture to D1                            | CSV; Sheets OAuth blocked                                     | Native missing/malformed/empty provider contracts; late draft-loading recovery                                |
| Keyword Trends      | `tool-operations.spec.ts`, `consent.spec.ts`                                                  | Explicit comparison and scope; table filter/sort N/A                       | Original source/window/capture and successful-empty D1/R2 run restore free       | N/A                                                           | Successful empty Trends response; no discovery on navigation/reload                                           |
| SERP Overview       | `tool-operations.spec.ts`                                                                     | Explicit keyword analysis and market; rank table filter/sort N/A           | Real adapter/service analysis restored from D1/R2                                | N/A                                                           | Provider 503 is visible without paid retry; explicit successful empty notice                                  |
| Content Optimizer   | `tool-operations.spec.ts`, `content-outline-consent.spec.ts`                                  | Brief submit; separately authorized competitor outlines                    | Brief D1/R2 restore; each selected saved brief requires its own outline consent  | N/A                                                           | Original SERP ingredient capture; zero/unknown word counts; unknown heading counts remain unavailable         |
| Page Investigation  | `application.spec.ts`, `internal-link.spec.ts`, `tool-operations.spec.ts`                     | Exact URL/date/country/device/type; provider inspection separate           | Scoped evidence and saved action; provider D1/R2 restore                         | N/A                                                           | Independent performance/crawl errors; URL/prerequisite absence                                                |
| Topic Clusters      | `tool-operations.spec.ts`                                                                     | Explicit topic planning and scoped content handoff; manual filter/sort N/A | Real suggestions SDK and D1/R2 restore                                           | Clipboard Markdown via actual Copy plan for AI                | Partial demand stays Unknown/Unranked; native empty/missing payload contracts                                 |
| Saved Keywords      | `research.spec.ts`, `keyword-operation-contract.spec.ts`, `tool-recovery-operations.spec.ts`  | Server include filters, genuine empty filters, tags                        | Save, tag, reload and delete real D1 rows; project boundary                      | CSV preserves capture and scope; Sheets OAuth blocked         | Free read 503 and real-service recovery                                                                       |
| Rank Tracking       | `rank-operation-contract.spec.ts`, `tool-recovery-operations.spec.ts`                         | Keyword filters; unknown versus observed absence                           | Real config/run/snapshots with captured market and depth                         | CSV includes status/capture/source/scope                      | Failed read recovery; unchecked ranks stay Unknown; local/deployed workflow limitation below                  |
| SEO Opportunities   | `application.spec.ts`, `paging.spec.ts`, `history.spec.ts`, `internal-link.spec.ts`           | Status filtering, pagination across 121 items                              | Save, progress, implementation baseline, measurement and append-only history     | N/A                                                           | Missing/empty/failed evidence; non-comparable measurements remain pending                                     |
| Search Performance  | `first-party-operations.spec.ts`, `tool-recovery-operations.spec.ts`                          | Pages/queries, device/country, sorting and table controls                  | Actual GSC service behind fixture adapter; URL scope                             | Full dataset CSV; Sheets OAuth blocked                        | Free read failure and recovery; disconnected property distinct                                                |
| Link Opportunities  | `first-party-operations.spec.ts`, `internal-link.spec.ts`, `tool-recovery-operations.spec.ts` | Query handoff/context priority; manual filter/sort N/A                     | Real GSC shaping and own-page content check                                      | N/A                                                           | Failed GSC read; presence errors distinct from no link                                                        |
| Cannibalization     | `first-party-operations.spec.ts`, `tool-recovery-operations.spec.ts`                          | Query context retained to links; manual filter/sort N/A                    | Real GSC shaping and page action handoff                                         | N/A                                                           | Failed read and real service recovery; shared rankings not called causal competition                          |
| Local Rank Grid     | `local-ai-operations.spec.ts`                                                                 | Keyword, geocoded location, radius, 3×3 grid                               | Nine real service cells; original scoped R2 captures restore free                | N/A                                                           | Invalid location and partial/error cells covered natively; no empty pins sold as observations                 |
| Domain Overview     | `research.spec.ts`, `provider-contracts.spec.ts`                                              | Explicit overview plus separate keyword load; filters                      | Original capture/scope on stored D1/R2 run                                       | Keyword CSV                                                   | Missing versus zero rank buckets; legacy/partial saved results                                                |
| Backlinks           | `provider-list-operations.spec.ts`, `provider-contracts.spec.ts`                              | Summary and four tables, sorting, upstream filter and empty result         | Real adapters; scoped caches and saved summary                                   | Four CSV tabs carry source, capture, target, scope and paging | Unknown spam/count/history distinct from zero; paid reload requires authorization                             |
| Expired Domains     | `first-party-operations.spec.ts`, `tool-recovery-operations.spec.ts`                          | Restored status/domain filters; no paid request on filter                  | Actual R2 stored run and D1 harvest read                                         | N/A                                                           | Unknown availability preserved; empty filters and failed harvest read recovery; live feed/entitlement blocked |
| Competitor Insights | `provider-list-operations.spec.ts`, `provider-gap-operations.spec.ts`                         | Discovery/pin/exclude; explicit keyword/link gap comparison                | Real D1 overrides reapplied to restored R2 analysis                              | Keyword/link gap CSV preserves scope and precision            | Native missing/partial discovery and gap contracts; input validation distinct from provider absence           |
| Site Audit          | `first-party-operations.spec.ts`, `tool-recovery-operations.spec.ts`                          | Stored crawl filter, empty filter, URL sorting                             | Real completed audit and page rows reopened                                      | CSV; Sheets OAuth blocked                                     | Failed status read and retry; new crawl workflow limitation below                                             |
| On-Page Fixes       | `first-party-operations.spec.ts`, `tool-recovery-operations.spec.ts`                          | Generate from stored crawl; All/Pending/Approved filters                   | Actual D1 approval toggles survive reload; other project clean                   | Approved rows flow to report; direct export N/A               | Failed read; no completed audit gets explicit prerequisite; live AI rewrite blocked                           |
| Client Report       | `first-party-operations.spec.ts`, `report-recovery.spec.ts`                                   | Authorship controls; list sorting N/A                                      | Independent actual stored/source reads; authorship survives reload               | Actual browser PDF under print media                          | GBP connection failure does not block stored posts; missing sources remain labeled                            |
| AI Visibility       | `local-ai-operations.spec.ts`                                                                 | Explicit brand lookup and include filter; refresh N/A                      | Real SDK/service cache; history and reload prefill only                          | CSV includes original source/scope/capture                    | Native source/partial/zero/month contracts; no automatic paid call on reload                                  |
| Prompt Explorer     | `local-ai-operations.spec.ts`                                                                 | Explicit selected models and web-search setting                            | Actual model adapter/cache; URL/history prefill only                             | N/A (no direct export control)                                | Native per-model error isolation; reload does not authorize a paid call                                       |
| Local SEO           | `local-ai-operations.spec.ts`                                                                 | Explicit profile, review crawl and citation search                         | R2 review ownership receipt; scoped citation analysis restores without a new RPC | N/A                                                           | Thin citation sample stays unknown; review ownership denial; GBP OAuth/writes blocked                         |

The committed Local SEO case in `ff2e0530` adds the provider's canonical `40102`
successful-empty Citation response, original source/market/query/capture display,
cache reuse and free reload. Its separate strict direct cold-route run passes
**1/1** with zero browser/external/failed-response diagnostics. The run initially
exposed uninitialized GSC handler exports through a traced false circular import;
deferring the request helper into its sole existing authenticated OAuth handler
repairs that initialization edge without retries, route warming or suppression.
The causal RED and clean GREEN archives remain separate. This case is not added
to the previous frozen 82-case total; the full fresh 83-case suite passes separately.

## Workflow and live integration boundaries

- The local Vite/Cloudflare adapter reports that its Workflows and chat Durable
  Objects are unavailable. Seeded completed audit/rank runs certify stored
  application workflows and result rendering; they do not certify a newly
  queued crawl/rank job executing or recovering. Native workflow tests are
  additional evidence, not a deployed job integration pass.
- Real Google OAuth renewal/revocation, provider entitlement/responses, GBP
  publishing, Sheets export, deployed job recovery, live Hyperdrive and deployed
  R2 permissions remain **blocked** by the confirmed lack of staging/access.
- No production data, website, paid service, migration deployment, merge or
  release is changed by the acceptance runner.

## Execution ledger

- **Implemented:** raw SDK HTTP fixtures and strict transport guards; five
  isolated projects; all 24 operation rows above; source/capture/scope CSV
  assertions with retained downloads; immediate saved-brief outline consent;
  original provider capture and unknown-versus-zero rendering.
- **Verified increments:** the affected run passed 15/16 cases; its Trends
  transport/navigation cancellation is preserved in
  `.logs/evidence/acceptance-affected-16`. The following frozen-source focused
  run passed all 5 cases in 2.0 minutes, including corrected Trends empty/capture
  restoration, citation persistence and parsed CSV metadata. Its full summary,
  server log and downloaded CSVs are in
  `.logs/evidence/acceptance-focused-5-green`. These increments are not counted
  as one passing complete suite.
- **Previously verified complete suite:** the frozen-source run started at
  `2026-10-13T17:46:52.660Z` and passed all **82 unique cases in 21 files** in
  **8.93 minutes**, with CLI exit 0, unexpected failures 0, flaky cases 0,
  skipped cases 0 and reporter/case errors 0. These comprise 27 destination
  landing/mobile layout checks and 55 functional/authentication/storage/recovery
  cases. All 24 desktop landing diagnostic attachments report zero browser
  errors, unexpected external requests and failed server responses. The server
  transport guard recorded zero blocked external requests. The complete log,
  server log, JSON summary, decoded diagnostics and retained artifacts (37 PNGs,
  six CSVs and one PDF) are preserved in
  `.logs/evidence/acceptance-final-82/`. This is one complete passing run, not
  a union of focused increments.
- **Visual evidence:** the final-run overview and mobile Page Investigation
  screenshots show populated controls and source/capture information. The
  desktop `page-evidence.png` caught a transient fade-in; it is retained as-is
  and does not establish visual acceptance. A separate settled visual-only case
  passed with zero browser errors, unexpected external requests and failed
  responses. Its desktop/mobile captures show populated scope controls, original
  source/capture and action handoffs without horizontal mobile overflow. The
  summary, captures and inspected details are in `.logs/evidence/page-settled/`.
  This case is separate from, and is not added to, the 82-case count.
- **Verified Linux CI:** the exact source `3ece2362` passes
  [the audit workflow](https://github.com/ThinkingSpade/FlyRocketSeo/actions/runs/38443618376).
  The inspected logs/artifacts confirm the same 82 unique application cases in
  21 files, each with one attempt, no retries, failures, skips or flaky results.
  The complete logs, JSON case inventory, downloads and source metadata are in
  `.logs/evidence/ci-3ece2362/`. That CI run does not certify later local source.
- **Latest verified complete suite:** application/test source `ff2e0530` passes
  one fresh-state **83/83-case run in 21 files**, starting
  `2026-10-13T19:04:54.605Z`, duration **539.25 seconds (9.0 minutes)**. Reporter
  unexpected/flaky/skipped/top-level errors are zero. This includes the repaired
  cold GSC path and canonical empty Citation original-capture/cache/free-reload
  case. All 83 results are single-attempt passes with zero case errors. The 24
  landing diagnostics are empty; server external guard blocks and temporary
  diagnostic tags are zero. The archive retains 37 PNGs, six CSVs and one PDF;
  port 3102 is free and the server stopped. Complete evidence and the per-case
  manifest are in `.logs/evidence/acceptance-final-83/`; previous frozen and
  focused runs are not combined into this count. There are 27 destination/mobile
  checks and 56 functional/authentication/storage/recovery cases.
- **Blocked:** real provider/OAuth/billing and deployed job acceptance remains
  blocked as listed above; absent credentials never count as an integration
  pass. An automatic Cloudflare production deployment following the audit push
  is confirmed by the exact commit/build/version linkage; the user confirmed it
  was intentional. Publishing later local repairs awaits approval for its
  deployment effect or a verified nondeploying path in `publication-gate.md`.
  Rollback or trigger changes need
  approval; verification-only GitHub jobs do not establish that an audit-branch
  push cannot trigger deployment.
- The inherited 51 unique verified browser cases remain historical evidence;
  landing diagnostics are not substituted for the operation rows above.
