# Screen-by-screen UX audit

This audit supplements the earlier repository/functionality and data-integrity audits. The baseline is the shared-UX stage at `1db6093128bf320abec956a7bbea717af4afae02`; the after captures come from accepted run `38443982692` at code commit `cb43a397a7f3a337c238e2089d25d827a77a0fe6`. Final touch-menu regression evidence is documented separately in `verification.md`.

## Cross-cutting findings and repairs

The original product direction remains: performance, evidence, a specific next action and eventually measurable progress. The dashboard previously led with a broad analysis launcher and research shortcuts while Search Console performance appeared below several cards. It now leads with performance and ranking/CTR review actions. Root entry opens Overview and preserves a valid remembered project.

The shared shell retains accessible dialogs, command search, modal mobile navigation, visible focus, task-grouped links and an inline optional-provider notice. Domain tables now distinguish unrequested results from empty results, identify estimated metrics, expose sorting semantics and avoid inventing pagination totals. Export options match their actual format, and denied clipboard access has recovery guidance. Empty-state calls to action were aligned and retained.

The final screenshot review found a separate interaction defect: the fixed selection bar could cover its portaled export menu after coarse-pointer target sizing caused wrapping. Visibility/bounds assertions missed it. Actual touch tests failed at 320px and 390px; positioning the menu above the toolbar fixed them.

## Route inventory and actual evidence

Each suffix is relative to `/p/{projectId}`. Unless stated otherwise, the evidence is a desktop disconnected/empty/form screenshot, not a completed data workflow. All 25 initial route captures completed without recorded page-level horizontal overflow.

<!-- prettier-ignore -->
| Screen / suffix | Observed state and disposition | Remaining verification |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Overview / root | Performance first; next actions and setup steps; responsive card hierarchy | Populated reports, slow/error variants, real project switch |
| SEO Opportunities / opportunities | Missing evidence shown as unavailable; audit and GSC next steps; centered action | Populated priorities, duplicates, persisted progress |
| Keyword Research / keywords | Input and provider options; honest empty state; narrow capture | Search/save/tracking handoff with representative results |
| Saved Keywords / saved | Empty saved table, filters and pagination | Save/edit/tag/export persistence and project isolation |
| Keyword Trends / trends | Missing Search Console evidence distinguished from no keywords | Comparative trends, sampling and paid-provider errors |
| SERP Overview / serp | Keyword/location inputs and explanatory empty state | Result sources, estimates and alternate locations |
| Domain Overview / domain | Fixture rows loaded only after consent; sorting, metric help, CSV and clipboard checks; five widths | Live provider accuracy, large/partial datasets, selected exports with real providers |
| Competitors / competitors | Shared shell and three investigation tabs render | Discovery and gap workflows, cost and relevance |
| Backlinks / backlinks | Domain/URL form and empty state; narrow capture | Null event fields, restored analyses and populated filters |
| Content Optimizer / content | Brief form and output explanation | End-to-end brief generation, evidence and export |
| Page Explorer / page | Page/location form and explanation | Page drill-down, missing/redirected pages and results |
| Topic Clusters / clusters | Topic/location inputs and business-context guidance | Generation, relevance and saved outputs |
| Rank Tracking / rank-tracking | No tracked domains, clear add action; narrow capture | Add/check/history/remove and scheduling |
| Search Performance / search-performance | Explicit Google OAuth setup-required state; narrow capture | Authorized connection, refresh, dates and populated drill-downs |
| Link Opportunities / links | GSC prerequisite and consistent Search Performance destination | Real source/destination/anchor evidence |
| Cannibalization / cannibalization | GSC prerequisite and consistent Search Performance destination | Query/page evidence and benign multi-page cases |
| Local Rank Grid / local-grid | Location prerequisite, scan controls and explanation | Map tiles were blocked by test isolation; real map/scan unverified |
| Site Audit / audit | Crawl form and no-audit state; narrow capture | Actual crawl, progress, cancellation, failures and reports |
| On-Page Fixes / on-page | Centered audit prerequisite and next action | Page fixes, approval, retry and output persistence |
| Client Report / report | Report shell explicitly says GSC is unavailable; narrow capture | Populated reporting, print/PDF, data windows and provenance |
| AI Visibility / brand-lookup | Brand input and labeled empty state | Real model answers, source attribution and metering |
| Prompt Explorer / prompt-explorer | Prompt/model controls and paid-request disclosure | Provider failures, model comparison and streamed output |
| Local SEO / local | Business lookup and disconnected local-search context | Real business matching and local data accuracy |
| Expired Domains / expired-domains | Domain prerequisite and niche explanation | Candidate discovery, availability and purchase-link safety |
| Project settings / settings | Project fields and OAuth setup guidance | Save errors, archive confirmation and cross-project behavior |

## What was not changed

The UX increment does not alter provider contracts, database schemas, OAuth handlers, scheduled jobs or server authorization. It does not implement a new opportunity lifecycle or claim every populated workflow works. The next steps and release gates are explicit in `remaining-improvements.md`.
