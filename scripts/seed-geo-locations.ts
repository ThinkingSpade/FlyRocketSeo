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
 * D1-only: this script has no Postgres write path. It refuses to run (see
 * `assertD1Provider` below) when `DATABASE_PROVIDER=postgres` is set in
 * `.env.local`, rather than silently seeding D1 while a Postgres deployment
 * keeps reading an empty `geo_locations` table.
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
// Cross-importing from src/ is safe here even though both modules warn
// against being imported from src/shared or src/server: that warning is
// about the Worker startup graph. scripts/ is a standalone Node CLI, never
// bundled into the Worker — the same reasoning scripts/migrate-d1-to-postgres.ts
// already relies on for its own src/db/d1/schema import.
import { US_STATES } from "../src/client/features/geo/usStates";
import { LOCATION_OPTIONS } from "../src/shared/keyword-locations";
import { loadLocalEnv, parseArgs } from "./cli-utils";

const API_BASE = "https://api.dataforseo.com";
const LOCATIONS_PATH = "/v3/keywords_data/google_ads/locations";
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

  console.log("Fetching the Google Ads locations list from DataForSEO...");
  const rawRows = await fetchLocations(apiKey);
  console.log(`Fetched ${rawRows.length} raw location rows.`);

  const { rows, skipped } = buildGeoLocationRows(rawRows);
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
      "picker silently empty with no error to explain why. This script does " +
      "not support Postgres yet — port fetchLocations/buildGeoLocationRows " +
      "above onto a Postgres write (scripts/migrate-d1-to-postgres.ts already " +
      "shows this codebase's own POSTGRES_DATABASE_URL connection pattern), " +
      "or run this script against a D1 deployment instead if that is viable " +
      "for you. Refusing to run.",
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
// DataForSEO fetch + defensive response parsing (unknown-typed throughout —
// every field is read through a type-predicate guard, never `as`-narrowed).
// Hand-rolled rather than the app's dataforseo-client, matching
// scripts/verify-geo-support.ts's own precedent for this exact endpoint: this
// is a standalone script, not Worker runtime code.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

type RawLocationRow = {
  location_code?: number;
  location_name?: string;
  location_code_parent?: number;
  country_iso_code?: string;
  location_type?: string;
};

function toRawLocationRow(value: unknown): RawLocationRow {
  if (!isRecord(value)) return {};
  return {
    location_code: readNumber(value.location_code),
    location_name: readString(value.location_name),
    location_code_parent: readNumber(value.location_code_parent),
    country_iso_code: readString(value.country_iso_code),
    location_type: readString(value.location_type),
  };
}

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
 * .superpowers/sdd/geo-t1-t2-report.md).
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
// Row derivation. geo_locations' country_code/state_code/parent_metro_code
// are not columns DataForSEO hands over directly on every row — they are
// derived by walking each row's location_code_parent chain, built once as an
// in-memory map since the whole list arrives in a single response.
// `population` is never provided by this endpoint and is intentionally left
// null (see the population column's comment in src/db/app.schema.ts) — no
// source here can supply it, and an invented number is worse than none.
// ---------------------------------------------------------------------------

type GeoLocationRow = {
  code: number;
  name: string;
  type: string;
  stateCode: string | null;
  parentMetroCode: number | null;
  countryCode: number;
};

function buildGeoLocationRows(raw: RawLocationRow[]): {
  rows: GeoLocationRow[];
  skipped: number;
} {
  const byCode = new Map<number, RawLocationRow>();
  for (const row of raw) {
    if (row.location_code !== undefined) byCode.set(row.location_code, row);
  }

  // Reuses LOCATION_OPTIONS' existing ISO<->Google-country-code pairing
  // (shortLabel is the 2-letter ISO code — see resolveGeo.ts's own
  // countryLabelForCode for the same "don't keep a second country table"
  // reasoning) rather than inventing a second country table here.
  const isoToCountryCode = new Map<string, number>();
  for (const option of LOCATION_OPTIONS) {
    isoToCountryCode.set(option.shortLabel, option.code);
  }

  // Reuses Task 5's already-verified US_STATES codes rather than guessing a
  // state abbreviation from name text: DMA names like "Dallas-Fort Worth TX"
  // are not reliably parseable (some span multiple states; some carry no
  // trailing abbreviation at all).
  const stateAbbreviationByCode = new Map<number, string>();
  for (const state of US_STATES) {
    if (state.stateCode)
      stateAbbreviationByCode.set(state.code, state.stateCode);
  }

  const rows: GeoLocationRow[] = [];
  let skipped = 0;

  for (const row of raw) {
    const {
      location_code: code,
      location_name: name,
      location_type: type,
    } = row;
    if (code === undefined || name === undefined || type === undefined) {
      skipped += 1;
      continue;
    }

    const countryCode = resolveCountryCode(row, byCode, isoToCountryCode);
    if (countryCode === null) {
      skipped += 1;
      continue;
    }

    rows.push({
      code,
      name,
      type,
      countryCode,
      stateCode: resolveStateCode(row, byCode, stateAbbreviationByCode),
      parentMetroCode: resolveParentMetroCode(row, byCode),
    });
  }

  return { rows, skipped };
}

/** Ancestor chain from (not including) `startParent` up to the root, guarded
 * against a cyclic parent reference (should never happen in real data, but
 * the guard is nearly free). */
function walkParents(
  startParent: number | undefined,
  byCode: Map<number, RawLocationRow>,
): RawLocationRow[] {
  const chain: RawLocationRow[] = [];
  const seen = new Set<number>();
  let cursor = startParent;
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byCode.get(cursor);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.location_code_parent;
  }
  return chain;
}

function resolveCountryCode(
  row: RawLocationRow,
  byCode: Map<number, RawLocationRow>,
  isoToCountryCode: Map<string, number>,
): number | null {
  if (row.location_type === "Country" && row.location_code !== undefined) {
    return row.location_code;
  }
  if (row.country_iso_code) {
    const mapped = isoToCountryCode.get(row.country_iso_code);
    if (mapped !== undefined) return mapped;
  }
  for (const ancestor of walkParents(row.location_code_parent, byCode)) {
    if (
      ancestor.location_type === "Country" &&
      ancestor.location_code !== undefined
    ) {
      return ancestor.location_code;
    }
  }
  return null;
}

function resolveStateCode(
  row: RawLocationRow,
  byCode: Map<number, RawLocationRow>,
  stateAbbreviationByCode: Map<number, string>,
): string | null {
  if (row.location_code !== undefined) {
    const direct = stateAbbreviationByCode.get(row.location_code);
    if (direct) return direct;
  }
  for (const ancestor of walkParents(row.location_code_parent, byCode)) {
    if (ancestor.location_code === undefined) continue;
    const hit = stateAbbreviationByCode.get(ancestor.location_code);
    if (hit) return hit;
  }
  return null;
}

function resolveParentMetroCode(
  row: RawLocationRow,
  byCode: Map<number, RawLocationRow>,
): number | null {
  if (row.location_type === "DMA Region") return null; // a metro has no "parent metro"
  for (const ancestor of walkParents(row.location_code_parent, byCode)) {
    if (
      ancestor.location_type === "DMA Region" &&
      ancestor.location_code !== undefined
    ) {
      return ancestor.location_code;
    }
  }
  return null;
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
