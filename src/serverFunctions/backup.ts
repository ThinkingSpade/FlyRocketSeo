import { createServerFn } from "@tanstack/react-start";
import { getTableName, is, Table } from "drizzle-orm";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getDatabaseProvider } from "@/db/provider";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

const BACKUP_FORMAT_VERSION = 1;

// Tables holding auth secrets or transient state. A downloadable backup file
// should never carry password hashes, OAuth tokens, or live session ids, so
// these are excluded — the export is a copy of your SEO *data*, not credentials.
const EXCLUDED_TABLES = new Set(["account", "session", "verification", "jwks"]);

/**
 * Exports the instance's data as a single JSON snapshot for self-hosters to
 * keep offsite. Self-hosted only: in hosted mode the database is multi-tenant
 * and a full-table dump would leak other customers' data, so it's blocked.
 *
 * Works for both D1 and Postgres because it reads through the provider-aware
 * Drizzle `db` handle rather than touching files (a Worker can't reach the
 * Docker volume directly). Reads every mapped table except the credential /
 * session tables above.
 */
export const exportBackup = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    if (await isHostedServerAuthMode()) {
      throw new AppError(
        "FORBIDDEN",
        "Data backup is only available in self-hosted mode.",
      );
    }

    const tables: Record<string, unknown[]> = {};
    // The schema barrel re-exports table objects alongside a few non-table
    // values; the Table guard keeps us to the real tables and is provider-safe.
    for (const value of Object.values(schema)) {
      if (!is(value, Table)) continue;
      const name = getTableName(value);
      if (EXCLUDED_TABLES.has(name)) continue;
      tables[name] = await db.select().from(value);
    }

    const exportedAt = new Date().toISOString();
    const backup = {
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt,
      provider: getDatabaseProvider(),
      tables,
    };

    // Return the snapshot pre-serialized: the row values come from generic
    // table objects (typed `unknown`), which the server-function serialization
    // contract rejects. Handing back a JSON string keeps the payload primitive
    // and lets the client write it straight to a Blob.
    return {
      fileName: `flyrocketseo-backup-${exportedAt.slice(0, 10)}.json`,
      json: JSON.stringify(backup, null, 2),
    };
  });
