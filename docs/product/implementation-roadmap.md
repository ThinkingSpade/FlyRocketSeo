# FlyRocketSEO implementation roadmap

Date: 2026-10-13. Baseline: `49096606273eaeaeff7b82e49b1a767a48e65eca`.
Branch: `audit/flyrocketseo-reliability-2026-10-13`.

## Goal and boundaries

Make existing workflows reliable before expanding the product. Preserve project-scoped authorization, explicit paid-request consent, saved analysis reuse, and the existing React/TanStack/Cloudflare architecture. No production deployment, merge, production data mutation, paid subscription, or infrastructure migration is part of this branch.

The supplied product brief is the target vision, not a statement that the existing platform has been fully verified. This first increment repairs independently reproducible Opportunities defects and records an evidence-based inventory and handoff for the wider transformation. Code inspection, deterministic execution, mocked component checks, and authenticated end-to-end verification must be reported separately.

## First increment: audit evidence and loading correctness

Files: `src/client/features/opportunities/opportunityModel.ts`, `OpportunitiesPage.tsx`, `OpportunityTiles.tsx`, focused regression tests, and a small pure audit-state helper if needed.

1. Reproduce the disabled audit query's perpetual loading state when no completed audit exists. Test the actual page branch with controlled query results. Show a useful no-audit action instead; do not enable a fetch with an empty audit ID.
2. Reproduce false zero technical metrics during loading, missing results, and no-audit states. Distinguish unavailable, failed, loading, no completed audit, empty crawl, and usable evidence. Preserve genuine zero findings when evaluated pages are available.
3. Reproduce overcounted affected pages. Count distinct affected URLs across all issue categories, not the sum of category counts or the limited example URLs.
4. Reproduce metadata findings on failed or unknown fetches. Limit metadata checks to successful captured pages; describe redirects and short content as review signals rather than automatic ranking failures.
5. Label click figures as hypothetical scenarios over the input GSC window, not promised extra monthly traffic. Preserve separate actions while avoiding overlapping headline totals.
6. Add regression tests before implementation, run targeted verification, and record exact limitations. Do not claim the full suite or live browser workflow passed without execution.

## Later increments, in priority order

| Priority | Work | Impact | Complexity | Dependencies / acceptance |
| --- | --- | --- | --- | --- |
| P0 | Trace every feature from route to provider/cache/error handling | High | Large | Authenticated staging and provider fixtures; success, empty, error, restore and cross-project tests per workflow |
| P0 | Project-access error recovery | High | Small/medium | Confirm real authorization error codes; transient failures stay retryable without weakening server authorization |
| P0 | Audit billing/auth modes and metered request entry points | High | Medium | Verify deployed mode; opening or switching tabs must not incur spend |
| P1 | Reorganize navigation around Overview, Research, Optimize, Track and Manage | High | Medium | Preserve deep links; test desktop/mobile navigation and active project retention |
| P1 | Connected page-detail workflow and shared evidence context | High | Large | Project, account, date, country, device and source keys consistently scoped |
| P2 | Persistent opportunity lifecycle and evidence snapshots | High | Large | Tenant-scoped schema and migration review; detector versioning; no silent duplicate tasks |
| P2 | Decline/recovery, internal links and measured outcomes | High | Large | Comparable GSC windows, crawl coverage, content inspection and measurement caveats |
| P3 | Competitor gaps and AI visibility expansion | Conditional | Large | Verified provider coverage, explicit spend authorization and honest limitations |

## Verification and release gate

The execution environment currently cannot resolve GitHub/package download hosts, so source is read through the GitHub connector and focused files are reconstructed with matching Git blob hashes. No production credentials are available. Attempt the repository-native test/build commands when a full checkout is available; record blocked checks rather than inventing results.

Before approval to merge: `pnpm install --frozen-lockfile`, `pnpm run ci:check`, `pnpm test`, `pnpm run build`, then the relevant Playwright suites in an isolated test deployment with synthetic data, two project contexts and provider calls mocked or explicitly budget-approved. No deployment command should be run merely to verify this branch.
