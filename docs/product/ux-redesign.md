# UX direction: performance, next action, evidence, result

Date: 2026-10-13. This document distinguishes implemented changes from the proposed next product increment. No complete dashboard rebuild or route deletion is claimed.

## Implemented in this branch

The sidebar now groups the existing 24 destinations under Overview, Research, Optimize, Track, and Manage. Overview and SEO Opportunities are first; GSC Insights is renamed Search Performance. Existing route URLs, icons, deep links, and selected-project parameters remain intact. Tests check the full destination set, uniqueness, ordering, and two project IDs.

Opportunities now distinguishes unavailable/loading/not-run/empty/usable crawl evidence, gives a reachable audit action, counts unique affected pages, and labels hypothetical click scenarios. Its methodology disclosure identifies the GSC window and uncalibrated assumptions. Temporary project-access failures stay on a retryable screen rather than being redirected away.

## Proposed dashboard

The opening screen should answer four questions in order: what changed, what needs attention, what to do next, and what happened after prior work. Keep advanced data below those answers.

```text
Website / project       Market + device       Evidence window
Data status: GSC connected | crawl captured DATE | provider optional

Performance                 Next best actions
Clicks and impressions      Up to 3 evidence-backed priorities
Compared with prior window  Why this matters / affected page / investigate
Unknown sources stay named  No invented counts or promised traffic gains

Changes to investigate      Progress and results
Declining pages / failures   In progress / implemented / awaiting evidence
Open the supporting report  Actual before/after, with caveats

Research tools and full reports, available below and in the sidebar
```

Retain independent dashboard queries and card-level failure handling already present in `ProjectDashboardPage.tsx`. Do not reintroduce a page-wide loading waterfall merely to simplify the layout. A missing optional provider should not block GSC or stored crawl workflows.

## Progressive consolidation

Research should become Keyword Research (discovery, trends, saved keywords, SERP drill-down), Domain and Competitors, and Backlinks. Expired domains remains an advanced tool. Preserve old URLs through aliases/redirects only after tests cover restored runs, authorization, and paid refresh consent.

Optimize should become Site Audit and Page Investigation. Page Investigation brings together current Page Explorer, content briefs, on-page findings, internal links, and potential query overlap. Topic planning can live inside the content workflow rather than another top-level destination.

Track should expose Search Performance, Rank Tracking, AI Visibility with Prompt Explorer inside it, and Local Visibility with local grids. Manage should collect reports and integrations/settings; existing global settings and AI/MCP access must remain reachable while navigation is consolidated.

## Connected declining-page workflow

Select a decline with its exact comparison window. Open the affected URL without losing project, account/property, market, device, search type, or filters. Show query/page evidence and coverage, then the captured content and technical state. Fetch a competitor/SERP comparison only after explicit authorization where it costs money. Present a proposed change with supporting evidence and unknowns. Save a task, record implementation, and return to a results view using comparable observed windows.

Use one shared context contract rather than each page inventing its own date/location defaults. Scope query/cache keys to all relevant context. On project changes, preserve the existing keyed Outlet reset and separately audit any external localStorage filters.

## Interaction and state rules

Loading shows a skeleton or named loading state, not zero. Not connected explains what connecting enables. No completed audit offers the audit workflow and acknowledges running/failed jobs. Empty captured evidence explains coverage. A failed request shows a retry for the failed source only, labeled when retrying would spend. Stale data remains visible with original capture time and a separate refresh action. Insufficient evidence suppresses impact estimates instead of replacing them with sample values.

Every opportunity detail should include what was found, why it matters, affected assets, source/window, confidence limitations, a defensible priority, specific safe next steps, and progress. The action should be to investigate or prepare a change until evidence supports implementation. Do not suggest that selecting Implemented changes the website automatically.

Use accessible labels, keyboard-visible focus, semantic tables, and text alongside status colors. On mobile, stack the action list above secondary graphs and keep filters/context visible. Five groups alone do not establish usability: authenticated desktop/mobile tests and a brief task-based user review remain required.

## Acceptance tasks for the next increment

A new user with only GSC connected can find a relevant page investigation without configuring a paid provider. A project with no audit sees a useful action rather than a spinner or healthy zero. A saved analysis reopens without paid traffic. A user can explain the evidence behind a priority, record an implementation, and later distinguish observed change from inferred cause. Two project contexts never share selections, tasks, or stale measurements.
