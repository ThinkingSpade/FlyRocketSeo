# Isolated PostgreSQL runtime verification

Date: 2026-10-13. This is local PostgreSQL execution, not a claim about live
Hyperdrive, production migrations, OAuth, or provider entitlement. No staging
access is available and live integrations remain blocked.

The runtime suite imports the production provider selection, schema barrel,
postgres.js driver, request-scoped `withPgClient`, atomic `runBatch`, opportunity
repository, and project/auth repositories. A Node adapter supplies only the
Cloudflare environment binding with a guarded disposable connection string.
Database methods and SQL execution are not mocked.

Run `node scripts/postgres-runtime.mjs` to create a PostgreSQL 17 Alpine container
on the local Docker engine. Each run uses a random database/container identity,
fake credentials, a dynamically assigned `127.0.0.1` port, bounded memory/CPU and
tmpfs storage on a read-only container root. The official image manifest is
pinned; each run records the server version. It supplies no production environment variables, mounts no host
data, and removes its own labelled container after verification. An unavailable
engine or failed test exits unsuccessfully. The CI workflow uses this route;
remote CI execution has not been claimed by this local continuation.

The dedicated Vite/Vitest configuration disables env-file loading, and the
runner whitelists ordinary operating-system variables before starting tests.
Remote Docker hosts, supplied database URLs and provider secrets are excluded.

Docker Desktop on this Windows host failed before starting its engine. Its
backend diagnostic reported an inaccessible `dockerInference` socket. No Docker
reset, configuration change, or user-data deletion was attempted. Actual local
verification used the free portable PostgreSQL distribution linked from the
[PostgreSQL Windows downloads page](https://www.postgresql.org/download/windows/)
and [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries).

The downloaded archive was
`postgresql-17.11-5-windows-x64-binaries.zip`, SHA-256
`80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`.
Its `postgres --version` reported PostgreSQL 17.11. The archive and extracted
runtime are ignored under `.tmp/postgres-runtime/`; no Windows service was
installed.

To repeat that native run after placing the portable archive in the workspace:

```powershell
node scripts/postgres-runtime.mjs --native-bin .tmp/postgres-runtime/17.11-5/pgsql/bin
```

The runner initializes a fresh workspace-contained cluster with SCRAM
authentication, loopback-only listening, fake credentials, an ephemeral port,
and a random database. It stops that cluster in `finally`, verifying its identity
marker and resolved path before issuing a stop. Native logs/data are kept in the
ignored run directory for diagnostics; no production cleanup policy follows.
The native test cluster disables fsync to reduce test overhead, so the suite
does not certify crash recovery or production durability settings.

Coverage includes full committed PG migration execution and migrator replay;
request-scope enforcement, nested connection reuse and separate connections;
dedupe across detector versions; locked evidence/baselines; concurrent revision
conflicts and ordered transaction rollback; measurement event/result history;
status filtering before work-list paging; bounded per-task history and cursors;
organization/project/target scoping; absent versus incomplete observations;
actual project cascades; relational auth/project queries and archive/restore;
and durable evidence ownership fences and cleanup-ledger survival after deletion.

Local verification passed 14 runtime tests on PostgreSQL 17.11 and applied all 22
committed migrations, including the new evidence-object ledger. Nine ordinary
native tests separately verify isolation guards. The runner exited successfully
and the native server log confirms shutdown. No production code change was
needed to pass this runtime coverage. Three cleanup cases execute real PostgreSQL
claim/delete SQL with explicitly in-memory R2 fixtures: an aged unreferenced
snapshot, legacy evidence belonging to a deleted project, and interrupted SQL
bookkeeping after the R2 object is already gone. These tests do not
certify live R2; the application acceptance suite verifies isolated local R2.

Machine-readable results and setup notices are written under
`test-results/postgres-runtime/`. PostgreSQL emits expected migration identifier
truncation and idempotent-migration notices; the notice artifact retains them.
This is finite fixture coverage, not a certification of every repository,
PostgreSQL version, Cloudflare socket lifetime, or production access path.
