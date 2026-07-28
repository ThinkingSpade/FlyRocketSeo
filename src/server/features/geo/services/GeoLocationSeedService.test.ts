import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoLocationRow } from "@/server/features/geo/geoLocationSeedMapping";
import type {
  StagedGeoLocationChunk,
  StagedGeoLocationManifest,
} from "@/server/features/geo/geoLocationSeedStore";

const mocks = vi.hoisted(() => ({
  dataforseoGetJson: vi.fn<(path: string) => Promise<unknown>>(),
  upsertRows: vi.fn<(rows: GeoLocationRow[]) => Promise<void>>(),
  readManifest:
    vi.fn<(chunkSize: number) => Promise<StagedGeoLocationManifest | null>>(),
  writeStaged:
    vi.fn<
      (
        rows: readonly GeoLocationRow[],
        skippedRows: number,
        chunkSize: number,
      ) => Promise<StagedGeoLocationManifest>
    >(),
  readStagedChunk:
    vi.fn<
      (
        manifest: StagedGeoLocationManifest,
        offset: number,
      ) => Promise<StagedGeoLocationChunk>
    >(),
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  dataforseoGetJson: mocks.dataforseoGetJson,
}));

vi.mock("@/server/features/geo/repositories/GeoLocationSeedRepository", () => ({
  GeoLocationSeedRepository: { upsertRows: mocks.upsertRows },
}));

// GeoLocationSeedService no longer talks to R2 directly -- it delegates
// staging to GeoLocationSeedStore, so THIS file only needs to verify the
// orchestration decision (stage fresh vs. reuse what's staged), not R2/ndjson
// mechanics. Those live in geoLocationSeedStore.test.ts, mocked the same way
// dataforseoGetJson and the repository already are here: mock the direct
// dependency, not something two levels down.
vi.mock("@/server/features/geo/geoLocationSeedStore", () => ({
  GeoLocationSeedStore: {
    readManifest: mocks.readManifest,
    writeStaged: mocks.writeStaged,
    readStagedChunk: mocks.readStagedChunk,
  },
}));

// A dynamic import inside the service, but mocked the same way as a static
// one: vi.mock intercepts by module specifier regardless of import syntax.
vi.mock("@/client/features/geo/usStates", () => ({
  US_STATES: [
    { code: 21176, name: "Texas", stateCode: "TX" },
    { code: 21137, name: "California", stateCode: "CA" },
  ],
}));

/**
 * Five resolvable rows (Country, two States, two Cities) plus one row whose
 * country can never be resolved (no Country type, no country_iso_code, no
 * ancestor) — this is what a real DataForSEO response looks like structurally,
 * just tiny, so `seedChunk`'s reported `totalRows`/`skippedRows` can be
 * pinned exactly.
 */
function locationsEnvelope(statusCode = 20000) {
  return {
    tasks: [
      {
        status_code: statusCode,
        status_message: "Ok",
        result: [
          {
            location_code: 2840,
            location_name: "United States",
            country_iso_code: "US",
            location_type: "Country",
          },
          {
            location_code: 21176,
            location_name: "Texas",
            location_code_parent: 2840,
            country_iso_code: "US",
            location_type: "State",
          },
          {
            location_code: 21137,
            location_name: "California",
            location_code_parent: 2840,
            country_iso_code: "US",
            location_type: "State",
          },
          {
            location_code: 9_000_001,
            location_name: "Austin",
            location_code_parent: 21176,
            country_iso_code: "US",
            location_type: "City",
          },
          {
            location_code: 9_000_002,
            location_name: "Sacramento",
            location_code_parent: 21137,
            country_iso_code: "US",
            location_type: "City",
          },
          {
            location_code: 424_242,
            location_name: "Nowhere",
            location_code_parent: 999_999, // no such ancestor
            location_type: "City",
          },
        ],
      },
    ],
  };
}

describe("GeoLocationSeedService.seedChunk", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.dataforseoGetJson.mockReset();
    mocks.upsertRows.mockReset();
    mocks.upsertRows.mockResolvedValue(undefined);

    // Default: nothing staged yet, so every test that doesn't say otherwise
    // exercises the exact same "fetch, derive, slice in memory" path the
    // service always used to take unconditionally -- this is what keeps the
    // pre-existing tests below valid unchanged.
    mocks.readManifest.mockReset().mockResolvedValue(null);
    mocks.writeStaged.mockReset().mockImplementation(
      async (
        rows: readonly GeoLocationRow[],
        skippedRows: number,
        chunkSize: number,
      ): Promise<StagedGeoLocationManifest> => ({
        totalRows: rows.length,
        skippedRows,
        chunkSize,
        chunkByteOffsets: [],
      }),
    );
    mocks.readStagedChunk.mockReset();
  });

  it("writes the first chunkSize rows and reports more remaining", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    const result = await GeoLocationSeedService.seedChunk(0, 3);

    expect(result).toEqual({
      totalRows: 5,
      skippedRows: 1,
      writtenSoFar: 3,
      done: false,
    });
    expect(mocks.upsertRows).toHaveBeenCalledTimes(1);
    const written = mocks.upsertRows.mock.calls[0]?.[0] ?? [];
    expect(written.map((row) => row.code)).toEqual([2840, 21176, 21137]);
  });

  it("continues from a non-zero offset and reports done on the final chunk", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    const result = await GeoLocationSeedService.seedChunk(3, 3);

    expect(result).toEqual({
      totalRows: 5,
      skippedRows: 1,
      writtenSoFar: 5,
      done: true,
    });
    const written = mocks.upsertRows.mock.calls[0]?.[0] ?? [];
    expect(written.map((row) => row.code)).toEqual([9_000_001, 9_000_002]);
  });

  it("resolves state and metro codes onto the written rows via the mocked US_STATES table", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await GeoLocationSeedService.seedChunk(3, 3);

    const written = mocks.upsertRows.mock.calls[0]?.[0] ?? [];
    expect(written.find((row) => row.code === 9_000_001)?.stateCode).toBe("TX");
    expect(written.find((row) => row.code === 9_000_002)?.stateCode).toBe("CA");
  });

  it("throws without writing anything when the task status_code isn't 20000", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope(40501));
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await expect(GeoLocationSeedService.seedChunk(0, 3)).rejects.toThrow();
    expect(mocks.upsertRows).not.toHaveBeenCalled();
  });

  it("throws a clear error when the response has no tasks at all", async () => {
    mocks.dataforseoGetJson.mockResolvedValue({ tasks: [] });
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await expect(GeoLocationSeedService.seedChunk(0, 3)).rejects.toThrow(
      /status_code=\?/,
    );
  });

  it("throws rather than crash when the response isn't the expected shape at all", async () => {
    mocks.dataforseoGetJson.mockResolvedValue("not json at all");
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await expect(GeoLocationSeedService.seedChunk(0, 3)).rejects.toThrow();
    expect(mocks.upsertRows).not.toHaveBeenCalled();
  });

  it("writes nothing (but still reports totals) once offset is past the end", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    const result = await GeoLocationSeedService.seedChunk(5, 3);

    expect(result).toEqual({
      totalRows: 5,
      skippedRows: 1,
      writtenSoFar: 5,
      done: true,
    });
    expect(mocks.upsertRows).toHaveBeenCalledWith([]);
  });

  // --- Regression coverage for the production bug: every chunk call used to
  // re-fetch and re-derive the full list, which is what actually blew the
  // Workers Free plan's CPU ceiling. These tests pin the fix: a run's
  // fetch+derive pass happens at most once. ---

  it("does not re-fetch or re-derive when a later call in the same run finds staged data", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await GeoLocationSeedService.seedChunk(0, 3);
    expect(mocks.dataforseoGetJson).toHaveBeenCalledTimes(1);
    expect(mocks.writeStaged).toHaveBeenCalledTimes(1);

    // From here on, behave as though offset 0's call really did persist this
    // run's data in R2, so the next call finds it instead of nothing.
    mocks.readManifest.mockResolvedValue({
      totalRows: 5,
      skippedRows: 1,
      chunkSize: 3,
      chunkByteOffsets: [],
    });
    mocks.readStagedChunk.mockResolvedValue({
      chunk: [],
      writtenSoFar: 5,
      done: true,
    });

    const second = await GeoLocationSeedService.seedChunk(3, 3);

    // The whole point of the fix: still only the one fetch, total, for the
    // entire run.
    expect(mocks.dataforseoGetJson).toHaveBeenCalledTimes(1);
    expect(mocks.writeStaged).toHaveBeenCalledTimes(1);
    expect(mocks.readStagedChunk).toHaveBeenCalledTimes(1);
    expect(second).toEqual({
      totalRows: 5,
      skippedRows: 1,
      writtenSoFar: 5,
      done: true,
    });
  });

  it("always re-stages fresh data on offset 0, even when a manifest is already staged (re-seed)", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    mocks.readManifest.mockResolvedValue({
      totalRows: 5,
      skippedRows: 1,
      chunkSize: 3,
      chunkByteOffsets: [],
    });
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await GeoLocationSeedService.seedChunk(0, 3);

    // offset 0 means "(re-)seed from scratch" -- it must not even check
    // whether something is already staged before overwriting it.
    expect(mocks.readManifest).not.toHaveBeenCalled();
    expect(mocks.dataforseoGetJson).toHaveBeenCalledTimes(1);
    expect(mocks.writeStaged).toHaveBeenCalledTimes(1);
  });

  it("re-derives (self-heals) when resuming a run whose staged data is missing or expired", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    mocks.readManifest.mockResolvedValue(null); // nothing usable staged
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    const result = await GeoLocationSeedService.seedChunk(3, 3);

    expect(mocks.dataforseoGetJson).toHaveBeenCalledTimes(1);
    expect(mocks.readStagedChunk).not.toHaveBeenCalled();
    expect(result).toEqual({
      totalRows: 5,
      skippedRows: 1,
      writtenSoFar: 5,
      done: true,
    });
  });

  // --- Regression coverage for the country-scoping fix: production failed
  // TWICE fetching DataForSEO's unscoped, ~94,933-row global location list
  // (see this service's own header for the full history) -- even after the
  // fetch was staged to run only once per run, that one remaining pass over
  // the full list was still almost certainly too much CPU-bound work for the
  // Workers Free plan's fixed 10ms-per-invocation ceiling. The literal
  // expected string below is deliberately NOT built from
  // `buildGoogleAdsLocationsPath`/`GEO_SEED_COUNTRY` (unlike the service's
  // own `LOCATIONS_PATH`) -- asserting against the same helper the service
  // uses would make this test pass even if that shared helper regressed back
  // to the unscoped path. ---

  it("fetches the country-scoped locations endpoint, not the unscoped global list", async () => {
    mocks.dataforseoGetJson.mockResolvedValue(locationsEnvelope());
    const { GeoLocationSeedService } = await import("./GeoLocationSeedService");

    await GeoLocationSeedService.seedChunk(0, 3);

    expect(mocks.dataforseoGetJson).toHaveBeenCalledExactlyOnceWith(
      "/v3/keywords_data/google_ads/locations/us",
    );
  });
});
