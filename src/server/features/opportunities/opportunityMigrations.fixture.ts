import { readFileSync, readdirSync } from "node:fs";
import type { Client } from "@libsql/client";

/** Minimal opportunity databases do not contain unrelated rank/provider tables.
 * Full D1 application and PostgreSQL runtime suites apply every migration. */
export async function applyOpportunityMigrations(client: Client) {
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name) && name >= "0044")
    .toSorted()) {
    const source = readFileSync(`drizzle/${file}`, "utf8");
    if (
      /\b(?:opportunities|opportunity_(?:snapshots|events|runs|evidence_objects))\b/.test(
        source,
      )
    )
      await client.executeMultiple(source);
  }
}
