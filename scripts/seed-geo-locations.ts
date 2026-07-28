/**
 * Seeds the `geo_locations` D1 table (src/db/app.schema.ts) from DataForSEO's
 * authenticated Google Ads locations endpoint.
 *
 * WHY THIS SCRIPT IS NOT OPTIONAL, EVEN FOR SELF-HOSTERS:
 * Neither Google's nor DataForSEO's free, no-credential bulk location exports
 * contain a single "DMA Region" (US metro) row — that data is Nielsen's
 * licensed commercial property. `src/client/features/geo/usDmas.ts` ships
 * intentionally EMPTY for exactly this reason, having cross-checked four
 * independent free sources that all came back with zero DMA rows (see that
 * file's own header for the full paper trail). The ONLY channel that actually
 * has this data is the authenticated endpoint this script calls. Until an
 * operator runs this at least once against a real `DATAFORSEO_API_KEY`, the
 * `geo_locations` table has zero rows, `searchGeoLocations` (Task 7) returns
 * nothing, and Task 8's picker can only ever show the ~50 bundled states — no
 * metros, no cities. Running this is a REQUIRED setup step for every
 * self-hosted deployment, not a nice-to-have.
 *
 * SCOPED TO ONE COUNTRY (`GEO_SEED_COUNTRY` in geoLocationSeedMapping.ts,
 * "us" by default), matching the in-Worker "Seed location data" action
 * (`GeoLocationSeedService.ts`) rather than fetching DataForSEO's unscoped,
 * ~94,933-row global list the way this script originally did. This script
 * itself has no Cloudflare CPU ceiling to work around — it's a plain Node
 * process — but the actual gap this script exists to fill (see above) is US
 * DMA/metro rows specifically, a concept that only exists for the US in the
 * first place, so scoping here too avoids writing tens of thousands of
 * non-US rows this app has no use for, and keeps this script and the
 * in-Worker action reporting the same row counts for the same deployment.
 *
 * Usage:
 *   pnpm tsx scripts/seed-geo-locations.ts            # local D1 (default)
 *   pnpm tsx scripts/seed-geo-locations.ts --remote   # production D1 — the
 *                                                      # actual self-host step
 *
 * Requires `DATAFORSEO_API_KEY` in `.env.local` (this standalone script reads
 * `process.env` directly via cli-utils.ts's `loadLocalEnv()` — see the
 * missing-key message below for why `.dev.vars` alone, which only the
 * deployed Worker reads, isn't enough here; same convention as
 * scripts/verify-geo-support.ts).
 *
 * Idempotent: `code` is `geo_locations`' primary key, so every row is written
 * as `INSERT ... ON CONFLICT(code) DO UPDATE` — re-running replaces existing
 * rows with fresh data instead of duplicating them. Safe to re-run whenever
 * Google revises its geotarget list.
 *
 * No cost gate (unlike verify-geo-support.ts's billable probes): DataForSEO
 * documents this specific locations list as static reference data, normally
 * free (see that script's own probe 4, which hits this same endpoint). The
 * only real-world consequence here is writing to D1, which `--remote` already
 * opts into explicitly — local is the default specifically so a bare,
 * flag-less run can never touch a self-hoster's production database by
 * accident.
 *
 * D1-only: this particular script has no Postgres write path (it shells out
 * to `wrangler d1 execute` — see `applyToD1` below). It refuses to run (see
 * `assertD1Provider` below) when `DATABASE_PROVIDER=postgres` is set in
 * `.env.local`, rather than silently seeding D1 while a Postgres deployment
 * keeps reading an empty `geo_locations` table. Postgres deployments (and
 * anyone without a local key at all) should use the in-Worker "Seed location
 * data" action on the Settings page instead (GeoLocationSeedService.ts) —
 * it writes through the app's own provider-aware `db`, so it supports both
 * dialects, chunked to stay under the Cloudflare Free plan's CPU/subrequest
 * ceilings.
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
// Cross-importing from src/ is safe here even though usStates.ts's own header
// warns against being imported from src/shared or src/server: that warning is
// about the Worker startup graph. scripts/ is a standalone Node CLI, never
// bundled into the Worker — the same reasoning scripts/migrate-d1-to-postgres.ts
// already relies on for its own src/db/d1/schema import.
import { US_STATES } from "../src/client/features/geo/usStates";
// The row-derivation logic (location_code_parent walking -> country/state/
// metro) is shared with the in-Worker seed path (GeoLocationSeedService,
// used by the "Seed location data" Settings action) rather than duplicated —
// see that module's own header for the full split of what's shared vs
// script-only.
import {
  buildGeoLocationRows,
  buildUsStateCodeMap,
  isRecord,
  readNumber,
  readString,
  toRawLocationRow,
  buildGoogleAdsLocationsPath,
  GEO_SEED_COUNTRY,
  type GeoLocationRow,
  type RawLocationRow,
} from "../src/server/features/geo/geoLocationSeedMapping";
import { loadLocalEnv, parseArgs } from "./cli-utils";

const API_BASE = "https://api.dataforseo.com";
// Scoped to GEO_SEED_COUNTRY (see geoLocationSeedMapping.ts's "Country
// scoping" block) rather than the unscoped `.../locations` endpoint, so this
// CLI route and the in-Worker "Seed location data" action
// (GeoLocationSeedService.ts) always agree on what they seed. This script has
// no Cloudflare CPU ceiling of its own to worry about — it could still fetch
// the full ~94,933-row unscoped list — but this app's one actual gap is US
// DMA/metro data (see this file's own header above), so seeding the same
// scope here avoids writing tens of thousands of non-US rows this app has no
// use for, and avoids a self-hoster ever wondering why the CLI and the
// in-app action reported different row counts.
const LOCATIONS_PATH = buildGoogleAdsLocationsPath(GEO_SEED_COUNTRY);
const D1_BINDING = "DB"; // matches package.json's db:migrate:local / db:migrate:prod
const UPSERT_BATCH_SIZE = 200; // rows per multi-row INSERT statement

loadLocalEnv();
const args = parseArgs(process.argv.slice(2));

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main(): Promise<void> {
  assertD1Provider();

  const apiKey = process.env.DATAFORSEO_API_KEY;
  if (!apiKey) {
    printMissingKeyAndExit();
  }

  const scope: "local" | "remote" = args.remote === "true" ? "remote" : "local";

  console.log(
    `Fetching the Google Ads locations list from DataForSEO (scoped to "${GEO_SEED_COUNTRY}")...`,
  );
  const rawRows = await fetchLocations(apiKey);
  console.log(`Fetched ${rawRows.length} raw location rows.`);

  const { rows, skipped } = buildGeoLocationRows(
    rawRows,
    buildUsStateCodeMap(US_STATES),
  );
  if (skipped > 0) {
    console.warn(
      `Skipped ${skipped} row(s) missing a code/name/type, or whose country could not be resolved.`,
    );
  }
  if (rows.length === 0) {
    exit(
      "No usable rows parsed from the response — aborting without touching D1.",
    );
  }

  applyToD1(rows, scope);
  printCountsByType(rows);
}

/**
 * This app is provider-aware (`DATABASE_PROVIDER`; see src/db/provider.ts):
 * D1 by default, Postgres opt-in for self-hosters who outgrow it (see
 * docs/DEPLOY_INTERNET_FACING.md's "Choose your database" step). This
 * script only ever writes D1 — `applyToD1` below shells out to `wrangler d1
 * execute`, with no Postgres path at all. Running it unconditionally
 * against a Postgres deployment would silently seed a database the app
 * never reads: `searchGeoLocations` (Task 7) would keep returning nothing
 * from the REAL (Postgres) `geo_locations` table, with no error anywhere to
 * explain why. Fail loudly instead of guessing which database to write.
 *
 * Reads `process.env.DATABASE_PROVIDER` directly rather than importing
 * src/db/provider.ts's `getDatabaseProvider()`: that module reads
 * Cloudflare's `cloudflare:workers` env binding, which does not exist
 * outside a Worker, so it cannot be imported into this standalone Node
 * script. This mirrors the same dev-time-env constraint this file's own
 * header already notes for `DATAFORSEO_API_KEY`: set
 * `DATABASE_PROVIDER=postgres` in `.env.local` here to match whatever value
 * this deployment's Worker actually has configured as a secret — the two
 * are read from different places but must agree for this guard to see the
 * truth.
 */
function assertD1Provider(): void {
  const provider = process.env.DATABASE_PROVIDER;
  if (provider === undefined || provider === "" || provider === "d1") return;
  if (provider !== "postgres") {
    exit(
      `Unsupported DATABASE_PROVIDER "${provider}". Expected "d1" or ` +
        '"postgres" (matching src/db/provider.ts\'s own getDatabaseProvider()).',
    );
  }
  exit(
    "DATABASE_PROVIDER=postgres, but this script only writes D1 and has no " +
      "Postgres path (see this function's own doc comment above). Seeding D1 " +
      "here would write a database this deployment never reads, leaving the " +
      "picker silently empty with no error to explain why. Use the in-Worker " +
      '"Seed location data" action on the Settings page instead ' +
      "(src/server/features/geo/services/GeoLocationSeedService.ts) — it " +
      "writes through the app's own provider-aware `db` and supports " +
      "Postgres, or run this script against a D1 deployment instead if that " +
      "is viable for you. Refusing to run.",
  );
}

function printMissingKeyAndExit(): never {
  console.error("no DATAFORSEO_API_KEY found — add it to .dev.vars");
  console.error(
    "(this script reads it via scripts/cli-utils.ts's loadLocalEnv(), which checks " +
      ".env.local / .env, not .dev.vars directly — that file is what wrangler reads for " +
      "the deployed Worker. Copy the same value into .env.local to run this script.)",
  );
  process.exit(1);
}

function exit(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// DataForSEO fetch + defensive envelope parsing (unknown-typed throughout —
// every field is read through a type-predicate guard, never `as`-narrowed).
// Hand-rolled rather than the app's dataforseo-client, matching
// scripts/verify-geo-support.ts's own precedent for this exact endpoint: this
// is a standalone script, not Worker runtime code. `isRecord`/`readNumber`/
// `readString`/`toRawLocationRow` are imported above from
// geoLocationSeedMapping.ts rather than redefined here — only the envelope
// shape below (tasks/status_code/status_message) is script-only, since the
// in-Worker seed path parses that envelope differently (zod, matching
// dataforseo/account.ts's own established convention for this class of
// unwrapped reference-data endpoint — see GeoLocationSeedService.ts).
// ---------------------------------------------------------------------------

type DataforseoTaskShape = {
  status_code?: number;
  status_message?: string;
  result?: unknown[];
};

type DataforseoResponseShape = {
  status_code?: number;
  status_message?: string;
  tasks?: DataforseoTaskShape[];
};

function toTaskShape(value: unknown): DataforseoTaskShape {
  if (!isRecord(value)) return {};
  return {
    status_code: readNumber(value.status_code),
    status_message: readString(value.status_message),
    result: Array.isArray(value.result) ? value.result : undefined,
  };
}

function toResponseShape(value: unknown): DataforseoResponseShape {
  if (!isRecord(value)) return {};
  const tasksRaw = value.tasks;
  return {
    status_code: readNumber(value.status_code),
    status_message: readString(value.status_message),
    tasks: Array.isArray(tasksRaw) ? tasksRaw.map(toTaskShape) : undefined,
  };
}

/**
 * GET, not POST (the brief's literal text says POST): this is static
 * reference data, not a billable "live" task — matching
 * src/server/lib/dataforseo/core.ts's `dataforseoGetJson` pattern for the
 * same class of endpoint, and the identical deliberate deviation
 * scripts/verify-geo-support.ts already made for this exact endpoint (see
 * .superpowers/sdd/geo-t1-t2-report.md). `LOCATIONS_PATH` (module scope,
 * above) is the country-scoped `/locations/$country` path, not the unscoped
 * `/locations` path this file's older comments elsewhere still describe by
 * name — see this file's own header and geoLocationSeedMapping.ts's
 * "Country scoping" block for why.
 */
async function fetchLocations(apiKey: string): Promise<RawLocationRow[]> {
  const response = await fetch(`${API_BASE}${LOCATIONS_PATH}`, {
    headers: { Authorization: `Basic ${apiKey}` },
  });
  const json: unknown = await response.json();
  const parsed = toResponseShape(json);
  const task = parsed.tasks?.[0];

  if (!response.ok || task?.status_code !== 20000) {
    exit(
      `DataForSEO locations request failed: HTTP ${response.status}, ` +
        `status_code=${task?.status_code ?? parsed.status_code ?? "?"} ` +
        `status_message=${JSON.stringify(task?.status_message ?? parsed.status_message ?? null)}`,
    );
  }

  return (task.result ?? []).map(toRawLocationRow);
}

// ---------------------------------------------------------------------------
// D1 upsert via wrangler — this script's own child process, not the app's
// Drizzle connection. A plain `getPlatformProxy` (as scripts/seed-rank-tracking.ts
// uses for local demo data) only ever resolves the LOCAL D1 simulation; this
// script must also be able to reach a self-hoster's real remote D1, so it
// shells out to `wrangler d1 execute`, matching scripts/d1-default-project-cleanup.ts's
// own precedent for scripted D1 writes.
// ---------------------------------------------------------------------------

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function sqlNullableStringLiteral(value: string | null): string {
  return value === null ? "NULL" : sqlStringLiteral(value);
}

function sqlNullableNumberLiteral(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

/** Batched multi-row upserts, `code` as the conflict target — re-running
 * replaces every row's other columns with freshly-fetched values rather than
 * duplicating rows, satisfying the brief's idempotency requirement.
 * `population` is deliberately never in the UPDATE SET below: this script has
 * no source for it (see the header comment), so a re-run must not clobber a
 * value some future enrichment step wrote there. */
function buildUpsertSql(rows: GeoLocationRow[]): string {
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const values = chunk
      .map(
        (row) =>
          `(${row.code}, ${sqlStringLiteral(row.name)}, ${sqlStringLiteral(row.type)}, ` +
          `${sqlNullableStringLiteral(row.stateCode)}, ${sqlNullableNumberLiteral(row.parentMetroCode)}, ` +
          `${row.countryCode}, NULL)`,
      )
      .join(",\n  ");
    statements.push(
      "INSERT INTO geo_locations (code, name, type, state_code, parent_metro_code, country_code, population)\n" +
        `VALUES\n  ${values}\n` +
        "ON CONFLICT(code) DO UPDATE SET\n" +
        "  name = excluded.name,\n" +
        "  type = excluded.type,\n" +
        "  state_code = excluded.state_code,\n" +
        "  parent_metro_code = excluded.parent_metro_code,\n" +
        "  country_code = excluded.country_code;",
    );
  }
  return statements.join("\n\n");
}

function applyToD1(rows: GeoLocationRow[], scope: "local" | "remote"): void {
  const sql = buildUpsertSql(rows);
  const tempPath = join(
    tmpdir(),
    `geo-locations-seed-${crypto.randomUUID()}.sql`,
  );
  writeFileSync(tempPath, sql, "utf8");

  console.log(`Applying ${rows.length} rows to D1 (${scope})...`);
  try {
    execFileSync(
      "wrangler",
      [
        "d1",
        "execute",
        D1_BINDING,
        scope === "remote" ? "--remote" : "--local",
        "--yes",
        "--file",
        tempPath,
      ],
      { stdio: "inherit", env: process.env },
    );
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function printCountsByType(rows: GeoLocationRow[]): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  console.log("\nDone. Counts by type:");
  for (const [type, count] of ordered) {
    console.log(`  ${type.padEnd(24)} ${count}`);
  }
  console.log(`  ${"TOTAL".padEnd(24)} ${rows.length}`);
}
