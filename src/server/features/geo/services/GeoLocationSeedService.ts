/**
 * In-Worker counterpart to `scripts/seed-geo-locations.ts`, for exactly the
 * case that script can't cover: a production deployment where
 * `DATAFORSEO_API_KEY` is a Cloudflare Worker secret. Worker secrets are
 * write-only — nothing outside the Worker can read one back out to a
 * laptop's `.env.local` — but the Worker itself already reads this same key
 * for every other DataForSEO call (`src/server/lib/dataforseo/core.ts`), so
 * seeding has to run here instead. Triggered only by the "Seed location
 * data" action on the Settings page (`src/routes/_app/settings.tsx`) —
 * never on render, navigation, or app start.
 *
 * CHUNKING — why, and why this shape:
 * DataForSEO's `/v3/keywords_data/google_ads/locations` returns the ENTIRE
 * Google geotarget list in one response (their own docs describe roughly
 * 95k rows across every supported country combined). There IS a
 * `/locations/$country` path variant mentioned in DataForSEO's docs, but no
 * worked example anywhere gives the exact value `$country` expects (ISO
 * code? numeric Google location code? full name?) — building the seed path
 * around an unverified parameter format, with no test key available to
 * confirm it, is a worse risk than the one this comment is about to accept.
 * So this service always fetches the full list, exactly like the script
 * does, and chunks the WRITE side instead: `seedChunk` slices at most
 * `ROWS_PER_CHUNK` already-mapped rows and writes only those before
 * returning, since it's the write side (D1/Postgres statements, each a
 * Worker subrequest) that this codebase has *already* been broken by once —
 * see `siteAuditWorkflowFallback.ts`'s `FALLBACK_BATCH_SIZE = 2` for the
 * exact same class of Cloudflare Free-plan ceiling breaking a bulk
 * DataForSEO-backed job. The Free plan hard-caps every invocation at 50
 * subrequests; `executeInBatches` (src/db/runBatch.ts) already sub-batches
 * at 100 rows per D1/Postgres call, so `ROWS_PER_CHUNK / 100` calls plus one
 * DataForSEO fetch must stay comfortably under that ceiling.
 *
 * Refetching and re-mapping the full list on every chunk call (rather than
 * fetching once and staging the remainder somewhere) is a deliberate
 * simplicity choice, not an oversight: DataForSEO documents this endpoint as
 * free (see the Settings UI copy this service's own caller shows, and
 * `scripts/verify-geo-support.ts`'s identical note for this endpoint), the
 * response is static reference data that doesn't change between one chunk
 * call and the next, and re-deriving `GeoLocationRow[]` is pure/synchronous
 * with no I/O of its own — so the only added cost per extra chunk is one
 * more free HTTP round trip, in exchange for never needing a staging store
 * (R2/KV) with its own cleanup and drift-from-the-DB failure modes. If a
 * self-hoster's Free-plan CPU ceiling turns out to be too tight even for
 * this (fetch+parse cost is paid on every call, independent of chunk size —
 * see the module doc on `geoLocationSeedMapping.ts`), the two existing
 * escape hatches both already work today: bump `limits.cpu_ms` on a paid
 * Workers plan (wrangler.jsonc already documents this), or run
 * `scripts/seed-geo-locations.ts` locally with a copy of the key.
 *
 * Idempotent and resumable: `GeoLocationSeedRepository.upsertRows` is an
 * upsert keyed on `code` (the primary key), so replaying the same offset —
 * or restarting an interrupted run from offset 0 — never duplicates a row,
 * only rewrites it with the same freshly-fetched data. Progress is not
 * persisted server-side; the caller (the Settings page) holds the cursor and
 * loops until `done`, the same client-driven shape
 * `AnalyzeProjectCard.tsx` already uses for its own sequence of bounded,
 * independent Worker invocations.
 */
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { dataforseoGetJson } from "@/server/lib/dataforseo/core";
import {
  buildGeoLocationRows,
  buildUsStateCodeMap,
  toRawLocationRow,
  sliceGeoLocationRowsChunk,
  type GeoLocationRow,
} from "@/server/features/geo/geoLocationSeedMapping";
import { GeoLocationSeedRepository } from "@/server/features/geo/repositories/GeoLocationSeedRepository";

const LOCATIONS_PATH = "/v3/keywords_data/google_ads/locations";

// See this file's own header for the full reasoning. In short: 20 D1/Postgres
// write batches (100 rows each, via executeInBatches) + 1 DataForSEO fetch =
// 21 subrequests per invocation, well under the Workers Free plan's
// 50-subrequest-per-request ceiling
// (developers.cloudflare.com/workers/platform/limits) — comfortable headroom
// for retries, while still making meaningful progress (~48 calls to seed the
// full ~95k-row list, instead of ~190 at a stingier chunk size). The
// fetch+map cost is paid every call regardless of this number, so a larger
// chunk is strictly better here up to the subrequest ceiling; this is well
// under half of it on purpose.
export const GEO_SEED_ROWS_PER_CHUNK = 2000;

export type GeoLocationSeedChunkResult = {
  totalRows: number;
  skippedRows: number;
  writtenSoFar: number;
  done: boolean;
};

// Loose, tolerant envelope schema — matches dataforseo/account.ts's own
// established pattern for this class of endpoint (an unwrapped GET the SDK
// doesn't type), rather than the SDK-typed `assertOk`/billing machinery
// built for task-based, billed endpoints. `.passthrough()` on the task shape
// keeps the (large) `result` array from tripping a strict-object parse; each
// row is then re-validated defensively by `toRawLocationRow`, which never
// throws on an unexpected shape.
const locationsEnvelopeSchema = z.object({
  status_code: z.number().nullable().optional(),
  status_message: z.string().nullable().optional(),
  tasks: z
    .array(
      z
        .object({
          status_code: z.number().nullable().optional(),
          status_message: z.string().nullable().optional(),
          result: z.array(z.unknown()).nullable().optional(),
        })
        .passthrough(),
    )
    .nullable()
    .optional(),
});

async function fetchAndMapAllRows(): Promise<{
  rows: GeoLocationRow[];
  skipped: number;
}> {
  const json = await dataforseoGetJson(LOCATIONS_PATH);
  const parsed = locationsEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "DataForSEO locations response had an unexpected shape",
    );
  }

  const task = parsed.data.tasks?.[0];
  if (task?.status_code !== 20000) {
    const statusCode = task?.status_code ?? parsed.data.status_code ?? null;
    const statusMessage =
      task?.status_message ?? parsed.data.status_message ?? null;
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `DataForSEO locations request failed: status_code=${statusCode ?? "?"} status_message=${JSON.stringify(statusMessage)}`,
    );
  }

  const raw = (task.result ?? []).map(toRawLocationRow);

  // Dynamic import, not a static one: usStates.ts's own header reserves it
  // client-only to keep the Worker's cold-start startup graph small (the
  // exact regression a 33-file lazy-loading refactor already fixed once in
  // this codebase). A seed run is a rare, explicitly-triggered operator
  // action, not something every isolate needs on every request, so it's
  // pulled in only here — same technique
  // `site-audit-workflow-helpers.ts` already uses to keep cheerio out of the
  // baseline bundle.
  const { US_STATES } = await import("@/client/features/geo/usStates");
  return buildGeoLocationRows(raw, buildUsStateCodeMap(US_STATES));
}

/**
 * Fetches the full location list, writes at most `chunkSize` rows starting
 * at `offset`, and reports genuine progress: `totalRows` and `skippedRows`
 * reflect what THIS call actually parsed (stable across calls since the
 * upstream list is static reference data), `writtenSoFar` is the cursor to
 * pass as `offset` on the next call, and `done` is only true once every row
 * has been written — never a guessed or rounded figure.
 *
 * `chunkSize` defaults to `GEO_SEED_ROWS_PER_CHUNK` (the real caller,
 * `seedGeoLocationsChunk` in `src/serverFunctions/geo.ts`, always uses the
 * default); tests pass a small value directly so chunk-boundary behaviour
 * doesn't require a multi-thousand-row fixture.
 */
async function seedChunk(
  offset: number,
  chunkSize: number = GEO_SEED_ROWS_PER_CHUNK,
): Promise<GeoLocationSeedChunkResult> {
  const { rows, skipped } = await fetchAndMapAllRows();
  const { chunk, writtenSoFar, done } = sliceGeoLocationRowsChunk(
    rows,
    offset,
    chunkSize,
  );

  await GeoLocationSeedRepository.upsertRows(chunk);

  return { totalRows: rows.length, skippedRows: skipped, writtenSoFar, done };
}

export const GeoLocationSeedService = { seedChunk } as const;
