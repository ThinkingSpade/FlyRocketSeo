import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoLocationRow } from "@/server/features/geo/geoLocationSeedMapping";

const store = vi.hoisted(() => new Map<string, string>());

// Real, minimal in-memory stand-in for the R2-backed primitives in
// r2-cache.ts -- not bare `vi.fn()` stubs, because these tests need actual
// round-trip storage (write in one call, read back correctly in a later
// one) to prove the byte-offset/ndjson scheme this module exists for
// actually recovers the right bytes, including with multi-byte location
// names. Mirrors r2-cache.ts's own real semantics: `getCached`/
// `getCachedRange` return null on a missing key, `setCached` JSON-serializes,
// the raw-text functions store/read verbatim.
vi.mock("@/server/lib/r2-cache", () => ({
  getCached: async (key: string): Promise<unknown> => {
    const raw = store.get(key);
    return raw === undefined ? null : JSON.parse(raw);
  },
  setCached: async (key: string, data: unknown): Promise<void> => {
    store.set(key, JSON.stringify(data));
  },
  setCachedRawText: async (key: string, text: string): Promise<void> => {
    store.set(key, text);
  },
  getCachedRange: async (
    key: string,
    offset: number,
    length: number,
  ): Promise<string | null> => {
    const raw = store.get(key);
    if (raw === undefined) return null;
    const bytes = new TextEncoder().encode(raw);
    return new TextDecoder().decode(bytes.slice(offset, offset + length));
  },
}));

import {
  buildNdjsonChunks,
  parseNdjsonChunk,
  GeoLocationSeedStore,
  ROWS_KEY,
} from "./geoLocationSeedStore";

/** Deliberately includes multi-byte UTF-8 names (this list is worldwide) --
 * a JS string's `.length` (UTF-16 code units) would silently misalign a byte
 * range read for any of these, so the fixture is designed to catch that
 * class of bug rather than assume ASCII. */
const ROWS: GeoLocationRow[] = [
  {
    code: 2840,
    name: "United States",
    type: "Country",
    stateCode: null,
    parentMetroCode: null,
    countryCode: 2840,
  },
  {
    code: 1,
    name: "München",
    type: "City",
    stateCode: null,
    parentMetroCode: null,
    countryCode: 2276,
  },
  {
    code: 2,
    name: "São Paulo",
    type: "City",
    stateCode: null,
    parentMetroCode: null,
    countryCode: 76,
  },
  {
    code: 3,
    name: "東京",
    type: "City",
    stateCode: null,
    parentMetroCode: null,
    countryCode: 392,
  },
  {
    code: 4,
    name: "Austin",
    type: "City",
    stateCode: "TX",
    parentMetroCode: null,
    countryCode: 2840,
  },
];

function sliceBytes(text: string, offset: number, length: number): string {
  const bytes = new TextEncoder().encode(text);
  return new TextDecoder().decode(bytes.slice(offset, offset + length));
}

describe("buildNdjsonChunks / parseNdjsonChunk", () => {
  it("records a byte offset per chunk boundary, starting at 0 and strictly increasing", () => {
    const { chunkByteOffsets } = buildNdjsonChunks(ROWS, 2);

    // 5 rows at chunkSize 2 -> chunks of 2, 2, 1 -> 4 offset entries.
    expect(chunkByteOffsets).toHaveLength(4);
    expect(chunkByteOffsets[0]).toBe(0);
    for (let i = 1; i < chunkByteOffsets.length; i += 1) {
      expect(chunkByteOffsets[i]).toBeGreaterThan(chunkByteOffsets[i - 1]);
    }
  });

  it("round-trips every chunk exactly via byte-range slicing, including multi-byte names", () => {
    const chunkSize = 2;
    const { ndjson, chunkByteOffsets } = buildNdjsonChunks(ROWS, chunkSize);

    const recovered: GeoLocationRow[] = [];
    for (let i = 0; i < chunkByteOffsets.length - 1; i += 1) {
      const start = chunkByteOffsets[i];
      const end = chunkByteOffsets[i + 1];
      const slice = sliceBytes(ndjson, start, end - start);
      recovered.push(...parseNdjsonChunk(slice));
    }

    expect(recovered).toEqual(ROWS);
  });

  it("throws on a corrupted line instead of silently dropping it", () => {
    // Unlike DataForSEO's response (defensively skipped row-by-row), this is
    // data this module wrote itself -- a parse failure here means real
    // corruption, not an upstream field outside this app's control.
    expect(() => parseNdjsonChunk("not json\n")).toThrow();
  });
});

describe("GeoLocationSeedStore", () => {
  beforeEach(() => {
    store.clear();
  });

  it("reports nothing staged before writeStaged has ever run", async () => {
    await expect(GeoLocationSeedStore.readManifest(2)).resolves.toBeNull();
  });

  it("round-trips the manifest through writeStaged then readManifest", async () => {
    const written = await GeoLocationSeedStore.writeStaged(ROWS, 1, 2);

    await expect(GeoLocationSeedStore.readManifest(2)).resolves.toEqual(
      written,
    );
  });

  it("treats a chunkSize mismatch the same as nothing staged", async () => {
    await GeoLocationSeedStore.writeStaged(ROWS, 0, 2);

    // A different chunkSize than what was staged with -- e.g. a deploy that
    // changed GEO_SEED_ROWS_PER_CHUNK mid-run -- must not serve chunks off a
    // stale offset scheme.
    await expect(GeoLocationSeedStore.readManifest(3)).resolves.toBeNull();
  });

  it("recovers every row across the whole run exactly, one staged chunk read at a time", async () => {
    const manifest = await GeoLocationSeedStore.writeStaged(ROWS, 0, 2);

    const recovered: GeoLocationRow[] = [];
    let offset = 0;
    let done = false;
    for (let guard = 0; !done; guard += 1) {
      if (guard > ROWS.length + 2) {
        throw new Error(
          "test loop safety cap hit -- readStagedChunk is not terminating",
        );
      }
      const result = await GeoLocationSeedStore.readStagedChunk(
        manifest,
        offset,
      );
      recovered.push(...result.chunk);
      offset = result.writtenSoFar;
      done = result.done;
    }

    expect(recovered).toEqual(ROWS);
  });

  it("reports done with an empty chunk once offset is past the staged total", async () => {
    const manifest = await GeoLocationSeedStore.writeStaged(ROWS, 0, 2);

    await expect(
      GeoLocationSeedStore.readStagedChunk(manifest, ROWS.length + 10),
    ).resolves.toEqual({ chunk: [], writtenSoFar: ROWS.length, done: true });
  });

  it("throws a GEO_SEED_DATA_LOST-coded error when the manifest is intact but the staged rows are gone", async () => {
    const manifest = await GeoLocationSeedStore.writeStaged(ROWS, 0, 2);
    // Simulates the rows object disappearing (R2 partial loss, or an
    // inconsistent TTL) while the manifest that references it survives --
    // distinct from "nothing staged at all", and NOT self-healed silently,
    // since retrying the same offset would just hit the same gap again.
    store.delete(ROWS_KEY);

    await expect(
      GeoLocationSeedStore.readStagedChunk(manifest, 0),
    ).rejects.toMatchObject({ code: "GEO_SEED_DATA_LOST" });
  });
});
