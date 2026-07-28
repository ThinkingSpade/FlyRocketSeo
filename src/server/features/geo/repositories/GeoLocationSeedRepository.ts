/**
 * Write half of the `geo_locations` D1/Postgres table, deliberately kept in
 * its own file rather than added to `GeoLocationRepository.ts`: that
 * repository's own header documents a hard invariant — "Reads only, and
 * reads D1 only ... must never import any metered search-provider client or
 * sibling paid-lookup server function" — so it can never reach DataForSEO
 * even indirectly. This file is the one place in `src/server/features/geo`
 * allowed to do so (via `GeoLocationSeedService`, which calls this
 * repository, never the other way around).
 *
 * Writes through the app's own provider-aware `db`/`executeInBatches`
 * (`src/db/runBatch.ts`) rather than `scripts/seed-geo-locations.ts`'s
 * `wrangler d1 execute` shell-out, which is D1-only. That is what makes this
 * path support BOTH D1 and Postgres for free: `executeInBatches` already
 * branches on `DATABASE_PROVIDER` (D1 -> `db.batch`, Postgres ->
 * `db.transaction`), so this repository never needs to know which dialect is
 * live.
 */
import { geoLocations } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import type { GeoLocationRow } from "@/server/features/geo/geoLocationSeedMapping";

/**
 * Upserts a (bounded — see GeoLocationSeedService's own chunk-size comment)
 * batch of rows. `code` is the conflict target (the table's primary key), so
 * re-running with the same rows replaces rather than duplicates — the
 * idempotency the brief requires for a safely-resumable seed. `population`
 * is deliberately excluded from BOTH `values` and the update `set`: this
 * endpoint never supplies it (see `GeoLocationRow`'s own comment), so a
 * fresh insert leaves it NULL and a re-run never clobbers a value some
 * future enrichment step wrote there — same contract
 * `scripts/seed-geo-locations.ts`'s own `buildUpsertSql` already keeps.
 */
async function upsertRows(rows: GeoLocationRow[]): Promise<void> {
  if (rows.length === 0) return;

  await executeInBatches(rows, (tx, row) =>
    tx
      .insert(geoLocations)
      .values({
        code: row.code,
        name: row.name,
        type: row.type,
        stateCode: row.stateCode,
        parentMetroCode: row.parentMetroCode,
        countryCode: row.countryCode,
      })
      .onConflictDoUpdate({
        target: geoLocations.code,
        set: {
          name: row.name,
          type: row.type,
          stateCode: row.stateCode,
          parentMetroCode: row.parentMetroCode,
          countryCode: row.countryCode,
        },
      }),
  );
}

export const GeoLocationSeedRepository = { upsertRows } as const;
