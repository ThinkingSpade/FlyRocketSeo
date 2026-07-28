import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoLocationRow } from "@/server/features/geo/geoLocationSeedMapping";

const mocks = vi.hoisted(() => ({
  dataforseoGetJson: vi.fn<(path: string) => Promise<unknown>>(),
  upsertRows: vi.fn<(rows: GeoLocationRow[]) => Promise<void>>(),
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  dataforseoGetJson: mocks.dataforseoGetJson,
}));

vi.mock("@/server/features/geo/repositories/GeoLocationSeedRepository", () => ({
  GeoLocationSeedRepository: { upsertRows: mocks.upsertRows },
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
});
