# Roadmap execution checklist

Branch: `audit/flyrocketseo-reliability-2026-10-13`. Starting commit: `f28cfe15`.
Design: `ux-redesign.md`, `opportunity-engine.md`, `implementation-roadmap.md`.

Implemented means application code exists. Verified means the named test executed
successfully. Blocked means required external access or evidence is missing.
Local browser fixtures never certify OAuth, live provider entitlement, or staging.

## Constraints

- Preserve project authorization, keyed project reset, saved-run reuse, and metered-request consent.
- Use existing React/TanStack, D1/PG, R2 and provider services.
- No merge, deployment, production mutation, paid service, or paid provider request.
- Commit independently tested increments on this dedicated branch.

## Increment plan

1. Reproduce existing repairs and baseline checks. Run application browser journeys with isolated data.
2. Repair missing backlink events and incomplete rank buckets; validate saved payloads, charts, exports, scope and capture dates.
3. Replace mandatory provider modal with optional setup status. Consolidate navigation through task tabs while retaining deep links and active context.
4. Build performance/actions/changes/results overview with independent queries. Reuse stored crawl, GSC and Page Explorer behind a page investigation; retain evidence scope in URLs and query keys.
5. Persist tenant/target-scoped opportunities and immutable evidence, stable dedupe, lifecycle history, implementation notes and aligned result observations. Add decline and content-aware link detectors.
6. Exercise investigation-to-task-to-result in the real application browser, project/account boundaries and metered safeguards; run static checks, full suite and build; independently review and commit fixes.

## Review focus

- Missing/partial evidence must never become healthy zero or a measured outcome.
- Project or target changes must not reuse another context's tasks, selections or results.
- Reruns/concurrent saves must preserve status, assignee, implementation notes and dates.
- Declines and results require matching complete windows; disappearing evidence is not a fix.
- Navigation/restoring evidence must not trigger paid refreshes or website changes.

## Evidence ledger

| Work                                                     | Implemented     | Verified                                                                                                                              | Blocked / remaining                                                |
| -------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Inherited audit/opportunity repairs                      | Yes             | 20/20 controlled contracts; native regression suite                                                                                   | Live provider/crawl applicability remains separate                 |
| Project recovery and authorization                       | Yes             | Local hosted sessions, two accounts/orgs, foreign project RPC denial and transient Retry exercised                                    | Live OAuth expiry/revocation and deployed configuration            |
| Provider history contracts                               | Yes, `b775587e` | 49 focused tests; null/zero/partial/date/cache/chart/export cases                                                                     | Approved live entitlement/response access                          |
| Exact-page scope and project market preferences          | Yes, `eb3377fe` | Evidence/property/window and six project-store regressions                                                                            | Wider provider field/export certification                          |
| Optional setup and progressive tools                     | Yes             | Blocking modal browser RED reproduced; desktop/mobile navigation GREEN                                                                | Human task-based usability review                                  |
| Explicit Trends metered consent                          | Yes             | Automatic discovery browser RED; navigation/reload/restored evidence make zero discovery requests after repair                        | Actual live paid task remains unverified                           |
| Action-first dashboard and page investigation            | Yes, `717305c1` | React evidence rendering, scoped date/type browser interaction, independent card failures                                             | Live GSC/property access                                           |
| Persistent work, detectors and results                   | Yes, `fbb1dfa0` | SQLite/service tests and authenticated save/progress/reload/implementation/measurement journey                                        | Production migration, PG runtime, approved storage cleanup         |
| Work-list status filtering and pagination                | Yes, `f2aa9934` | 121-task real SQL tests; browser paging and oldest dismissed item                                                                     | Concurrent updates can move offset-page items                      |
| Retained event/result history                            | Yes             | Real SQL paging; browser 50 to 61 events, foreign history RPC denied                                                                  | R2 expiration/deleted-project/orphan cleanup                       |
| Keyword draft during late settings load                  | Yes, `953cb0af` | Deterministic actual application draft-loss RED then GREEN; deliberate tab/URL replacement retained                                   | Live provider data remains separate                                |
| Independent stored report posts after connection failure | Yes, `b5a0b531` | Actual connection-503 RED then GREEN; independent real stored-post handler returns 200                                                | Live GBP OAuth/writes remain blocked                               |
| Full native/static/build verification                    | Yes             | 3,366/3,366 tests in 337 files; Prettier, Knip, TypeScript, Oxlint, production build/root prerender/SPA shell all pass                | New branch CI not remotely executed; no deployment                 |
| Authenticated application acceptance runner              | Yes, `59aa3f1f` | 44/44 actual app cases pass; zero failed/flaky/skipped; 24 clean destination diagnostics; steady desktop/mobile screenshots inspected | User confirms no staging; fixtures never certify live integrations |

## Explicit remaining gates

- **Blocked live integrations:** no staging access, test OAuth renewal/revocation, authorized provider responses/entitlement, GBP writes or deployed background-job recovery. Fixture navigation or a missing-key state is never an integration pass.
- **Release gates:** review/apply migrations only after approval; verify PostgreSQL where used; approve retention/deletion policy and implement/verify R2 orphan/deleted-project cleanup before production migration. SQL cascade review and bounded reads do not certify object deletion.
- **First-version limitations:** one implementation baseline per saved action; repeated follow-up observations are retained. Multiple implementation cycles, prior-year/controlled causal analysis, broader detector families and field-level provenance across every legacy export are further work.
- **Preserved boundaries:** no website publishing, production mutations, merge/deployment, paid request or new paid service. Existing authorization, saved-run restoration and in-flight metered guards remain in use.

## Incremental commits

- `b775587e`: preserve unknown provider history observations.
- `eb3377fe`: scoped first-party page evidence and project market preferences.
- `fbb1dfa0`: tenant/target-scoped persisted work, evidence, lifecycle and outcomes.
- `f2aa9934`: page and filter the entire retained work set.
- `717305c1`: connect dashboard actions, page evidence and tracked work/results.
- `83b2c126`: optional provider setup and progressive navigation.
- `2574939b`: explicit paid discovery, restored-data reuse and in-flight guards.
- `953cb0af`: preserve keyword drafts and sequence initial report reads.
- `b5a0b531`: retain independent stored-post reads after connection failure.
- `59aa3f1f`: isolated hosted application tests, CI gate and production fixture guards.

## Verification commands

Run installed dependency CLIs directly when the local pnpm launcher stalls:
`node node_modules/vitest/vitest.mjs run --maxWorkers=4`,
`node node_modules/typescript/bin/tsc --noEmit`, repository static tools, build
script and Playwright. Preserve exit codes when logging. Record exact outcomes
and fixture/live boundaries below as each increment completes.

## Final verification record

- Tested code/test head: `59aa3f1f`; final documentation-only commit follows these checks.
- Native suite: 3,366 tests in 337 files, four workers, 110.98 seconds on the final source.
- Application browser: 44 cases, 200.77 seconds, starting 2026-10-13 10:39:19 UTC; zero unexpected failures, flaky cases or skips. Cold Report recovery and loaded mobile opacity/overflow are included.
- Static checks: full Prettier, Knip, TypeScript and type-aware Oxlint pass; Oxlint reports zero warnings/errors. Final production client/server build, root prerender, SPA loading-shell assertion and build TypeScript check pass. The existing large-chunk advisory remains; performance is not certified.
- Inherited controlled contracts: Opportunities 20/20 and project-access recovery harness pass. Their explicit doubles remain separate from actual application/persistence tests.
- Independent review: four initial P2 findings plus the final Report connection-error gate were corrected and regression verified. No remaining important regression was reported in the final scoped review; storage cleanup and first-version limits above remain explicit.
- Generated evidence: `test-results/acceptance-summary.json`, `test-results/acceptance-final-server.log`, screenshots/diagnostic attachments under `test-results/acceptance/`; local native/build/static logs under `.logs/`. These are ignored and reproducible. The new CI archives browser evidence when run; this continuation did not push or trigger remote CI.
- No production migration, deploy, merge, paid request, new service or website change occurred. Browser server stopped after acceptance.
