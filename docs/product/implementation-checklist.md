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

| Work                                        | Implemented    | Verified                                                 | Blocked / remaining                                               |
| ------------------------------------------- | -------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Existing audit/opportunity repairs          | Yes, inherited | 20/20 controlled contracts; 3,229 native tests pass      | Actual application browser coverage underway                      |
| Existing project recovery                   | Yes, inherited | Project-access harness passes all branches               | Live expired/revoked sessions pending                             |
| Full baseline                               | Inherited      | 3,229/3,229 bounded rerun; TypeScript passes             | Initial machine-load timeouts resolved                            |
| Provider history contracts                  | Yes, b775587e  | 49/49 focused tests, scoped lint and formatting          | Live entitlement unavailable                                      |
| Authenticated application workflows         | In progress    | Real local hosted sign-in works; modal defect reproduced | User confirms no staging or OAuth test access                     |
| Optional setup and progressive tools        | Pending        | Pending                                                  | None identified                                                   |
| Action-first dashboard / page investigation | In progress    | 13 evidence/context tests pass                           | Full browser journey underway                                     |
| Project market preference isolation         | Yes            | 6 preference/store tests pass                            | Legacy global preference deliberately not assigned to any project |
| Persisted lifecycle / detectors / results   | In progress    | SQLite persistence and schema parity tests pass          | Production migration intentionally not applied                    |

## Verification commands

Run installed dependency CLIs directly when the local pnpm launcher stalls:
`node node_modules/vitest/vitest.mjs run --maxWorkers=4`,
`node node_modules/typescript/bin/tsc --noEmit`, repository static tools, build
script and Playwright. Preserve exit codes when logging. Record exact outcomes
and fixture/live boundaries below as each increment completes.
