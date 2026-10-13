# Storage and provider continuation

Starting code/document head: `317d915b`. Branch: `audit/flyrocketseo-reliability-2026-10-13`.

## Authorized scope

Implement and verify R2 evidence cleanup, isolated PostgreSQL runtime behavior and
broader provider contracts. No live integration, production mutation, deployment,
merge or paid service/request is authorized. Tests use isolated data and fake
credentials. Missing runtimes/access are reported as blocked.

## Increments and expected evidence

1. Add durable evidence-object fencing and bounded manual cleanup. Preserve every
   snapshot referenced by work, implementation baselines or event history. Only
   canonical organization-owned keys can be considered. A 24-hour grace protects
   recent objects; live writers are never expired automatically. Preview is read
   only; an owner/admin must explicitly select and confirm cleanup. Recheck every
   candidate at execution. Expected: real SQLite tests reject referenced/recent/
   foreign/busy objects, preserve failure recovery and exercise writer/cleaner
   races. Actual application tests delete only isolated orphan R2 objects.
2. Verify actual PostgreSQL migrations and repository behavior in a disposable
   local engine with explicit fake credentials. Expected: real Postgres exercises
   schema, deduplication, revision conflicts, evidence/history, scope, paging and
   cascades. Docker/native runtime failure is a blocker, not a passing substitute.
3. Extend concrete Domain and Backlinks summary/list/saved contracts. Expected:
   successful, partial, unknown, zero, invalid and legacy/stale fixtures execute
   service/cache/restoration and display/export consumers; original capture dates
   and paid-refresh consent remain intact. Live provider access stays blocked.
4. Run integrated native/static/build and application-browser checks; independently
   review and commit tested increments, then update the execution checklist.

## Cleanup protocol

A dialect-paired SQL object ledger survives project deletion. Writers claim a
unique token before uploading and keep their claim through snapshot attachment.
Cleanup claims eligible unreferenced keys atomically, excluding writers. Deleted
content-addressed keys remain retired: they cannot be recreated while an earlier
cleanup could resume. Interrupted deletion is idempotently retryable. Unexpected
stranded writers remain quarantined for review; they are not aged into deletion.

Legacy objects without a writer ledger are protected for live projects. They can
be removed after their project is actually deleted and no metadata/history
references survive. Archived projects count as live. All new application writers
must use the fencing protocol before cleanup is released. No automatic cron or
bucket-wide expiration is introduced, and no task/history TTL is imposed.

## Execution ledger

- Planning: repository clean on the requested branch; existing 3,366 native and
  44 isolated application checks are prior evidence, not new integration passes.
- PostgreSQL: Docker remains unavailable; official portable PostgreSQL 17.11 executed all 22 migrations and passed 14 runtime cases. Nine isolation guards pass; the throwaway server stopped.
- Provider contracts: Domain/Backlinks summary/list/saved/SDK/display/export repairs are committed, including cache-copy ordering and billed malformed-task metadata. Remaining field families are explicit in data-integrity.md.

- Storage: durable writer ownership and manual owner/admin cleanup are implemented. Real SQLite covers references, roles, grace, retired keys, failed attachment/deletion and races. Five legacy cleanup objects execute at most 36 SQL statements before middleware. Authenticated browser fixtures verify real local R2 deletion, preserved history/baselines and actual SQL fault recovery.
- Final verification: 3,433 native tests, 14 real-PG cases, full 50 application cases plus five final affected cleanup cases (51 unique), static checks and build pass; final documentation formatting also passes. Source/test head `c2af177d`.
- Independent review: all four actionable findings repaired; 61 focused re-review checks pass. No new blocking defect reported.
- Blocked: live provider/OAuth/GBP/workflows, deployed R2/Hyperdrive, Docker/remote CI execution and production migration approval. No production mutation, deployment, merge, push or paid request.
