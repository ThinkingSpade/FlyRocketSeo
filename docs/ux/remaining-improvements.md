# Remaining improvements, in priority order

This branch is a verified UX increment, not a declaration that the platform is complete. Keep the earlier reliability fixes and the existing `docs/audits/` and `docs/product/` plans.

## P0 — Establish production-relevant reliability evidence

1. Exercise authenticated staging with two organizations and projects: project changes, stale tabs, revoked access, OAuth renewal, provider failures, restored analyses and permission-scoped cache keys. The local-noauth browser run cannot establish tenant isolation. Use authorized test credentials and synthetic data, not production accounts.
2. Investigate the repeated `/api/auth/get-session` 404 responses in local-noauth mode. The accepted baseline recorded 37. They did not produce captured JavaScript exceptions, but they are real unsuccessful requests. Do not hide all network failures or loosen authentication to make the test green.
3. Complete provider null/partial-result contracts from `docs/audits/data-integrity.md`, especially missing backlink-event defaults and incomplete domain-ranking buckets. Empty UI rendering does not establish numerical accuracy. Verify cost/consent behavior at the server boundary, not only in the browser.
4. Run populated, failed and slow-result journeys for each research tool before classifying it as end-to-end verified. Retain explicit paid-operation consent; do not introduce subscriptions or run chargeable lookups without approval.

## P1 — Finish the product experience

Consolidate related research and optimization destinations into contextual tabs or drill-downs only after checking saved links and current workflows. The task groups and command menu reduce navigation friction but do not remove every overlapping destination.

Add representative populated dashboard, tracking, reporting and technical-audit fixtures. Verify large tables, long domains, mobile landscape, 200% zoom, keyboard-only forms, invalid input and interrupted saves. Conduct screen-reader and contrast audits; test Firefox and WebKit in addition to Chromium.

Improve disconnected onboarding so the user has one clear primary step rather than repeated setup prompts across cards. Retain independent access to free/first-party capabilities. Review long helper copy and terminology on SERP, Trends and local tools with actual users.

Measure production-like load and interaction performance. The production build has a large-chunk advisory; no measured performance budget or Lighthouse improvement is claimed. The blocked external map tiles in the isolated run are not evidence that live maps are broken or working.

## P2 — Complete the evidence-to-results loop

Implement the tenant-scoped, persistent opportunity lifecycle described in `docs/product/opportunity-engine.md`: stable deduplication, evidence versions, reviewed actions, progress states and comparable before/after observations. The dashboard currently surfaces ranking/CTR reviews from existing Search Console analysis; it does not implement new decline detectors, content-aware link suggestions, completed-work tracking or causal impact measurement.

## P3 — Dataset-dependent expansion

Only after reliability and core workflows are established, evaluate competitor gaps, broader historical data, AI visibility and local intelligence. Document evidence coverage and cost before adding a provider. No new provider or paid dependency was introduced here.

## Release boundary

No merge, deployment, production migration, production-data mutation or new paid subscription is authorized by these documents. Review the dedicated branch and its exact verification evidence first. Leave support branches untouched unless the owner approves cleanup.
