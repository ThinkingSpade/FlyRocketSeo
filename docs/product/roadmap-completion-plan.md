# Remaining roadmap execution

Starting head: `bb93af37`; branch `audit/flyrocketseo-reliability-2026-10-13`.
The user approved finishing the remaining roadmap after the completion review.
The existing roadmap and UX/opportunity designs remain the specification.

## Scope and sequence

1. Finish field contracts across keyword/Labs research, competitor/bulk/comparison,
   local/rank and AI families already used by the application. Trace SDK envelopes
   through services, scoped caches, saved payloads, charts, derived claims and
   exports. Reproduce missing/zero, invalid values, dates, partial coverage and
   mismatched scopes before changing behavior. Preserve estimates, capture times,
   billing evidence and explicit metered consent.
2. Expand the authenticated application acceptance matrix for all 24 destinations.
   Exercise applicable operations, errors, empty states, restoration and exports
   with fake provider HTTP transport and isolated real D1/R2/KV. Unmatched outbound
   requests fail. Navigation is separate from operation coverage.
3. Review/test the complete source, commit coherent increments, run native/static/
   production-build and actual application checks. Verify the isolated PostgreSQL
   path after relevant storage changes. Preserve exact logs and tested commits.
4. Prepare remote CI/release review on the audit branch. Inspect publication and
   workflow triggers before writing remotely. Do not merge, deploy, migrate or
   modify production, create paid services, or make real paid provider calls.

## Ownership and interfaces

- Keyword agent: keyword/Labs adapters and corresponding services/consumers.
- Rank/local agent: SERP/BusinessData, local grid and rank/GBP read consumers.
- Browser agent: acceptance transport/seed/fixtures and operation cases; sole owner
  of the application test server on port 3102.
- Root: AI, competitor/backlinks comparison, shared scope/observation contracts,
  integration, commits, release preparation and verification ledger.
- Shared helpers and schema changes are coordinated before edits; each family
  retains public client/service types and explicit null/zero semantics.

## Completion boundaries

Live OAuth/provider/GBP/deployed workflow checks remain blocked by the confirmed
absence of staging access. Local fixture tests never certify entitlement. Deployed
Hyperdrive/R2 configuration, older-writer quiescence, crash recovery and production
migrations still require authorized release access. Conditional P3 intelligence
requires verified datasets, demonstrated demand and explicit cost approval; no
new dataset or invented observation will substitute for those prerequisites.

## Execution ledger

- Baseline: clean working tree; last source/test head `c2af177d`, documentation
  head `bb93af37`. Prior recorded verification is retained as historical evidence.
- Discovery: keyword monthly values/clickstream opt-in, local cell rank validation,
  bulk net/count aggregation, AI count/coverage and adapter billed errors require
  concrete regression coverage. Independent tasks run in parallel.
- Implemented increments: existing keyword/Labs, rank/local, AI/backlink,
  competitor/gap, Page Explorer, Content/On-Page, Citation and Trends consumed
  fields now carry explicit missing/zero, scope, source, capture, partial-coverage,
  restored-cache and export contracts. Real PostgreSQL aggregate mapping and
  additive captured-scope migrations are repaired; legacy observations remain
  usable with their unrecorded provenance unavailable.
- Reviewed regressions: SEO hostname identity retains registrable-domain lookup
  behavior for WHOIS/availability; restored outline consent belongs to its
  captured brief; Local SEO draft prefill and Backlinks in-flight guards preserve
  explicit user action. Meaningful REDs, focused GREENs and independent review
  evidence are retained in the verification ledger.
- Verified local source: application head `1096bcf0`; complete native suite
  3,780/396, real PostgreSQL 17/4 with all 24 migrations, global static checks,
  production build/root prerender/SPA shell and startup guard pass. The final
  fresh-state authenticated operation suite passes 82/82 cases in 21 files,
  with zero unexpected failures, flaky cases or skips. Remote CI is pending.
- Remaining external gates: live integrations and approved release verification
  remain blocked as described above. Conditional P3 datasets and later detector,
  implementation-cycle and causal-analysis extensions are future work.
