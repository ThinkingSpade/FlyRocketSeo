/**
 * Persists the ONE-TIME derived `GeoLocationRow[]` list across the ~48 chunk
 * calls a full seed run needs, so only the very first call in a run pays the
 * DataForSEO fetch + JSON parse + country/state/metro derivation cost -- see
 * GeoLocationSeedService.ts's own header for why paying that cost on EVERY
 * chunk call (the original design) was the actual production bug, not the
 * chunked D1 write.
 *
 * Stored as newline-delimited JSON, not one JSON.parse-able document: a later
 * chunk read fetches an exact R2 byte range (`getCachedRange`) covering just
 * its own rows and parses only that slice. Storing the derived list as a
 * single ordinary JSON blob would still force every chunk call to
 * `JSON.parse` the ENTIRE ~8-9MB list to get its own ~2,000 rows out -- on
 * the Workers Free plan's 10ms-per-invocation CPU ceiling
 * (developers.cloudflare.com/workers/platform/limits), that one parse alone
 * is very likely to exceed the budget by itself (this codebase's own
 * precedent: siteAuditWorkflowFallback.ts's `FALLBACK_BATCH_SIZE = 2` exists
 * because parsing just a couple of cheerio pages already blows this same
 * ceiling), so "store the whole thing and re-parse it every time" would
 * shrink the bug, not fix it.
 *
 * Writing every chunk as its own R2 object (one per chunk, all up front) was
 * considered and rejected: the Free plan hard-caps every invocation at 50
 * subrequests TOTAL, and R2 operations count against that same ceiling
 * (developers.cloudflare.com/workers/platform/limits -- the same ceiling
 * GeoLocationSeedService.ts's own header already accounts for on the D1
 * write side). Writing N separate chunk objects in the one invocation that
 * also does the D1 write for the first chunk would need 1 (DataForSEO fetch)
 * + N (chunk puts) + 20 (D1 batches) subrequests -- already over budget at
 * today's ~48 chunks, and it only gets worse as DataForSEO's location list
 * grows over time. A fixed, small number of R2 operations per call (one
 * manifest read/write plus one ranged rows read/write) does not scale with
 * chunk count at all.
 */
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  getCached,
  getCachedRange,
  setCached,
  setCachedRawText,
} from "@/server/lib/r2-cache";
import {
  sliceGeoLocationRowsChunk,
  type GeoLocationRow,
} from "@/server/features/geo/geoLocationSeedMapping";

const MANIFEST_KEY = "geo-location-seed/manifest";
// Exported for geoLocationSeedStore.test.ts only, to simulate the staged rows
// object disappearing independently of the manifest (R2 partial loss) --
// nothing outside that test should ever need this key directly.
export const ROWS_KEY = "geo-location-seed/rows.ndjson";

// A run "takes a few minutes" per the Settings copy
// (GeoLocationSeedSection.tsx); a day is generous headroom for an operator
// who starts one, is interrupted, and resumes later, while still not leaving
// scratch data around indefinitely once a run is abandoned outright.
const STAGED_TTL_SECONDS = 60 * 60 * 24;

const manifestSchema = z.object({
  totalRows: z.number().int().min(0),
  skippedRows: z.number().int().min(0),
  chunkSize: z.number().int().positive(),
  // Byte offsets into ROWS_KEY's newline-delimited JSON: chunk `i` spans
  // `[chunkByteOffsets[i], chunkByteOffsets[i + 1])`. Always one more entry
  // than there are chunks, starting with 0.
  chunkByteOffsets: z.array(z.number().int().min(0)),
});

export type StagedGeoLocationManifest = z.infer<typeof manifestSchema>;

const geoLocationRowSchema: z.ZodType<GeoLocationRow> = z.object({
  code: z.number(),
  name: z.string(),
  type: z.string(),
  stateCode: z.string().nullable(),
  parentMetroCode: z.number().nullable(),
  countryCode: z.number(),
});

export type StagedGeoLocationChunk = {
  chunk: GeoLocationRow[];
  writtenSoFar: number;
  done: boolean;
};

/**
 * Pure: encodes rows as newline-delimited JSON and records the byte offset of
 * every `chunkSize`-row boundary. Reuses `sliceGeoLocationRowsChunk` for the
 * row-index/done bookkeeping instead of re-deriving the same arithmetic here.
 * Byte lengths come from encoding each line's own UTF-8 bytes and summing --
 * never from re-encoding the accumulated string so far, which would turn
 * this into an O(n^2) pass -- location names are worldwide and routinely
 * multi-byte (e.g. "Munchen", "Sao Paulo" with diacritics, or non-Latin
 * scripts), so a JS string's `.length` (UTF-16 code units) would silently
 * misalign every later range read.
 */
export function buildNdjsonChunks(
  rows: readonly GeoLocationRow[],
  chunkSize: number,
): { ndjson: string; chunkByteOffsets: number[] } {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  const chunkByteOffsets: number[] = [0];
  let cumulativeBytes = 0;
  let offset = 0;
  let done = false;

  while (!done) {
    const sliced = sliceGeoLocationRowsChunk(rows, offset, chunkSize);
    for (const row of sliced.chunk) {
      const line = `${JSON.stringify(row)}\n`;
      lines.push(line);
      cumulativeBytes += encoder.encode(line).length;
    }
    chunkByteOffsets.push(cumulativeBytes);
    offset = sliced.writtenSoFar;
    done = sliced.done;
  }

  return { ndjson: lines.join(""), chunkByteOffsets };
}

/**
 * Pure: the inverse of one chunk's worth of lines written by
 * `buildNdjsonChunks`. Throws on a malformed line rather than skipping it --
 * unlike DataForSEO's response, this is data this service wrote itself
 * moments (or at most a day) earlier, so a parse failure here means real
 * corruption, not an upstream field this app doesn't control.
 */
export function parseNdjsonChunk(ndjsonSlice: string): GeoLocationRow[] {
  return ndjsonSlice
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => geoLocationRowSchema.parse(JSON.parse(line)));
}

/**
 * Reads back whatever this run has already staged, or null if nothing usable
 * has been staged yet (first call of a run, or the staged data expired/was
 * never written) -- either way, the caller's job is to (re-)derive and stage
 * fresh data, which is always safe: DataForSEO's location list is static
 * reference data, so re-deriving mid-run produces the same rows the original
 * derivation would have. A `chunkSize` mismatch is treated the same as
 * "nothing staged" -- it only happens if GEO_SEED_ROWS_PER_CHUNK changes
 * between the deploy that staged this data and the one now reading it, and
 * serving misaligned chunks off a stale offset scheme would be worse than
 * just re-deriving.
 */
async function readManifest(
  chunkSize: number,
): Promise<StagedGeoLocationManifest | null> {
  const cached = await getCached(MANIFEST_KEY);
  if (cached === null) return null;

  const parsed = manifestSchema.safeParse(cached);
  if (!parsed.success || parsed.data.chunkSize !== chunkSize) return null;
  return parsed.data;
}

/**
 * Stages already-derived rows so every later chunk call in this run can read
 * its own slice back cheaply instead of re-deriving. Takes rows the caller
 * already has in memory -- this never fetches or derives anything itself.
 */
async function writeStaged(
  rows: readonly GeoLocationRow[],
  skippedRows: number,
  chunkSize: number,
): Promise<StagedGeoLocationManifest> {
  const { ndjson, chunkByteOffsets } = buildNdjsonChunks(rows, chunkSize);
  const manifest: StagedGeoLocationManifest = {
    totalRows: rows.length,
    skippedRows,
    chunkSize,
    chunkByteOffsets,
  };

  // Rows before manifest, deliberately: these two writes aren't transactional
  // (R2 has no multi-key transaction), so if the process dies between them,
  // this ordering guarantees the worse-looking state (manifest present) never
  // happens without the rows it points to also being present. The failure
  // mode this leaves is "manifest missing" -- readManifest already treats
  // that as "nothing staged" and self-heals by re-deriving, rather than
  // readStagedChunk throwing GEO_SEED_DATA_LOST for a run whose first write
  // never actually got the chance to finish.
  await setCachedRawText(ROWS_KEY, ndjson, STAGED_TTL_SECONDS);
  await setCached(MANIFEST_KEY, manifest, STAGED_TTL_SECONDS);
  return manifest;
}

/**
 * Reads exactly one chunk's rows out of the staged ndjson via a single R2
 * range read, mirroring `sliceGeoLocationRowsChunk`'s own offset/done
 * contract so callers can treat a staged read and a fresh in-memory slice
 * identically. An offset past the last staged chunk reports "done" the same
 * way `sliceGeoLocationRowsChunk` does for a stale/out-of-range offset; an
 * offset the manifest says SHOULD exist but whose bytes are actually missing
 * is a distinct, worse condition -- staged data lost mid-run -- surfaced as
 * `GEO_SEED_DATA_LOST` rather than silently treated as "nothing left".
 */
async function readStagedChunk(
  manifest: StagedGeoLocationManifest,
  offset: number,
): Promise<StagedGeoLocationChunk> {
  const safeOffset = Math.max(0, Math.min(offset, manifest.totalRows));

  // Checked BEFORE indexing into chunkByteOffsets, not folded into the
  // undefined check below: when `totalRows` isn't an exact multiple of
  // `chunkSize`, `floor(totalRows / chunkSize)` is the index of the LAST
  // real chunk, not one past it, so clamping offset to `totalRows` and then
  // computing a chunk index would otherwise re-serve that last chunk's rows
  // instead of reporting "nothing left" -- `sliceGeoLocationRowsChunk`
  // avoids this for free because `Array.slice` past the end always returns
  // `[]`; a chunk-index lookup has no equivalent for free, so it's made
  // explicit here.
  if (safeOffset >= manifest.totalRows) {
    return { chunk: [], writtenSoFar: manifest.totalRows, done: true };
  }

  const chunkIndex = Math.floor(safeOffset / manifest.chunkSize);
  const start = manifest.chunkByteOffsets[chunkIndex];
  const end = manifest.chunkByteOffsets[chunkIndex + 1];

  if (start === undefined || end === undefined) {
    // Should be unreachable given a manifest writeStaged actually produced
    // (every in-range offset maps to a real chunk boundary) -- kept as a
    // defensive runtime fallback for a manifest whose chunkByteOffsets is
    // somehow inconsistent with its own totalRows/chunkSize. This project's
    // tsconfig doesn't set noUncheckedIndexedAccess, so TypeScript itself
    // won't force this check (it types array indexing as always-present) --
    // an actual out-of-bounds access still yields `undefined` at runtime
    // regardless of what the type says.
    return { chunk: [], writtenSoFar: manifest.totalRows, done: true };
  }

  const text = await getCachedRange(ROWS_KEY, start, end - start);
  if (text === null) {
    throw new AppError(
      "GEO_SEED_DATA_LOST",
      `Staged geo location rows missing for chunk ${chunkIndex} (offset ${safeOffset}) -- manifest expected bytes [${start}, ${end})`,
    );
  }

  const chunk = parseNdjsonChunk(text);
  const writtenSoFar = Math.min(safeOffset + chunk.length, manifest.totalRows);
  return { chunk, writtenSoFar, done: writtenSoFar >= manifest.totalRows };
}

export const GeoLocationSeedStore = {
  readManifest,
  writeStaged,
  readStagedChunk,
} as const;
