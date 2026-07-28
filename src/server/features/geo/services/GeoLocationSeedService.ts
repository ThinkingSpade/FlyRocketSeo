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
 * `/locations/$country` path variant mentioned in DataForSEO's docs (the SDK
 * even types it, `KeywordsDataApi.googleAdsLocationsCountry`), but no worked
 * example anywhere gives the exact value `$country` expects (ISO code?
 * numeric Google location code? full name?) — building the seed path around
 * an unverified parameter format, with no test key available to confirm it,
 * is a worse risk than the one this comment is about to accept. So this
 * service always fetches the full list, exactly like the script does.
 *
 * THIS USED TO ALSO RE-FETCH AND RE-DERIVE THE FULL LIST ON EVERY CHUNK
 * CALL, and that was a production bug, not a simplicity trade-off. The
 * reasoning at the time was "re-deriving `GeoLocationRow[]` is
 * pure/synchronous with no I/O of its own — so the only added cost per extra
 * chunk is one more free HTTP round trip". That reasoning conflated "free"
 * (no billing, no extra network wait) with "cheap" (no CPU cost) — parsing
 * the ~95k-row, multi-megabyte JSON response and re-deriving every row's
 * country/state/metro code IS synchronous CPU-bound work, and CPU time,
 * not network wait, is exactly what the Workers Free plan caps at a fixed
 * **10ms per invocation** (developers.cloudflare.com/workers/platform/limits
 * — the same ceiling `siteAuditWorkflowFallback.ts`'s
 * `FALLBACK_BATCH_SIZE = 2` already documents being broken by just a couple
 * of cheerio-parsed pages). A ~95k-row response is dramatically more parsing
 * than that, on literally every one of the ~48 chunk calls a full run needs
 * — so in production this didn't fail occasionally, it failed on the very
 * first call, every time, with the Worker invocation never completing
 * normally enough to return a real `GeoLocationSeedChunkResult` or even a
 * clean thrown error — which is what the client saw as `result` resolving to
 * `undefined` (see `GeoLocationSeedSection.tsx`'s own header for the client
 * side of this fix).
 *
 * The fix: fetch and derive the full list ONCE per run, then stage it in R2
 * via `GeoLocationSeedStore` so every later chunk call reads back only its
 * own ~2,000-row slice — see that module's own header for why the staged
 * data is newline-delimited JSON read by exact byte range rather than one
 * blob re-parsed whole (that alone would still risk the same 10ms ceiling),
 * and why chunks are NOT all written to R2 up front in the same invocation
 * (that would still risk the Free plan's separate 50-subrequest-per-
 * invocation ceiling, since R2 operations count against the same limit as
 * the DataForSEO fetch and the D1 write batches). If even the one remaining
 * per-run fetch+derive pass turns out to be too tight for a self-hoster's
 * Free-plan CPU ceiling, the two escape hatches this service always had
 * still work: bump `limits.cpu_ms` on a paid Workers plan (wrangler.jsonc
 * already documents this), or run `scripts/seed-geo-locations.ts` locally
 * with a copy of the key.
 *
 * Idempotent and resumable: `GeoLocationSeedRepository.upsertRows` is an
 * upsert keyed on `code` (the primary key), so replaying the same offset —
 * or restarting an interrupted run from offset 0 — never duplicates a row,
 * only rewrites it with the same data. `offset === 0` always (re-)stages
 * fresh data, since that's both the first run and the explicit "re-seed"
 * action; any other offset reuses whatever this run already staged, falling
 * back to a fresh re-stage if that's missing or expired (safe: DataForSEO's
 * list is static reference data, so re-deriving mid-run yields the same
 * rows). Progress is not persisted server-side beyond the staged run itself;
 * the caller (the Settings page) holds the cursor and loops until `done`,
 * the same client-driven shape `AnalyzeProjectCard.tsx` already uses for its
 * own sequence of bounded, independent Worker invocations.
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
import {
  GeoLocationSeedStore,
  type StagedGeoLocationManifest,
} from "@/server/features/geo/geoLocationSeedStore";

const LOCATIONS_PATH = "/v3/keywords_data/google_ads/locations";

// See this file's own header for the full reasoning. In short: 20
// D1/Postgres write batches (100 rows each, via executeInBatches) is 20
// subrequests either way, plus 1 DataForSEO fetch + 2 R2 puts (23 total) on
// the call that stages fresh data, or 2 R2 range/manifest reads (22 total)
// on every other call — both comfortably under the Workers Free plan's
// 50-subrequest-per-invocation ceiling
// (developers.cloudflare.com/workers/platform/limits), with headroom for
// retries, while still making meaningful progress per call (~48 calls to
// seed the full ~95k-row list, instead of ~190 at a stingier chunk size). A
// larger chunk size is strictly better here up to that ceiling.
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
 * Fetches + derives the full location list ONCE per run (offset 0, or any
 * offset whose run hasn't staged anything usable yet — see
 * `GeoLocationSeedStore.readManifest`) and stages it in R2; every other call
 * reads its own `chunkSize`-row slice back from that staged copy instead of
 * repeating the fetch+derive pass. See this file's own header for why
 * skipping that repeat is the actual fix, not an optimisation on top of one.
 *
 * Reports genuine progress either way: `totalRows`/`skippedRows` reflect
 * what the run's ONE fetch actually parsed (stable across calls since the
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
  const staged =
    offset === 0 ? null : await GeoLocationSeedStore.readManifest(chunkSize);
  const { manifest, freshRows } = staged
    ? { manifest: staged, freshRows: null }
    : await stageFreshRows(chunkSize);

  // `freshRows` is only set right after this same call staged them — slicing
  // in memory avoids an entirely avoidable R2 round trip for the chunk this
  // call already has sitting in a local variable. Every other call reads
  // back the slice it needs from what an EARLIER call in this run staged.
  const { chunk, writtenSoFar, done } = freshRows
    ? sliceGeoLocationRowsChunk(freshRows, offset, chunkSize)
    : await GeoLocationSeedStore.readStagedChunk(manifest, offset);

  await GeoLocationSeedRepository.upsertRows(chunk);

  return {
    totalRows: manifest.totalRows,
    skippedRows: manifest.skippedRows,
    writtenSoFar,
    done,
  };
}

async function stageFreshRows(chunkSize: number): Promise<{
  manifest: StagedGeoLocationManifest;
  freshRows: GeoLocationRow[];
}> {
  const { rows, skipped } = await fetchAndMapAllRows();
  const manifest = await GeoLocationSeedStore.writeStaged(
    rows,
    skipped,
    chunkSize,
  );
  return { manifest, freshRows: rows };
}

export const GeoLocationSeedService = { seedChunk } as const;
