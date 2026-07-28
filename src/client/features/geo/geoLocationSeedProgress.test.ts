import { describe, expect, it } from "vitest";
import {
  isGeoLocationSeedChunkResult,
  isStuckWithoutProgress,
} from "./geoLocationSeedProgress";

const VALID_RESULT = {
  totalRows: 100,
  skippedRows: 2,
  writtenSoFar: 20,
  done: false,
};

describe("isGeoLocationSeedChunkResult", () => {
  it("accepts a well-formed result", () => {
    expect(isGeoLocationSeedChunkResult(VALID_RESULT)).toBe(true);
  });

  it("rejects undefined -- the exact production symptom (issue's raw TypeError came from trusting this blindly)", () => {
    expect(isGeoLocationSeedChunkResult(undefined)).toBe(false);
  });

  it("rejects null", () => {
    expect(isGeoLocationSeedChunkResult(null)).toBe(false);
  });

  it("rejects a plain non-object value", () => {
    expect(isGeoLocationSeedChunkResult("not an object")).toBe(false);
  });

  it("rejects an object missing a required field", () => {
    const { done: _done, ...withoutDone } = VALID_RESULT;
    expect(isGeoLocationSeedChunkResult(withoutDone)).toBe(false);
  });

  it("rejects an object whose field has the wrong type", () => {
    expect(
      isGeoLocationSeedChunkResult({ ...VALID_RESULT, writtenSoFar: "20" }),
    ).toBe(false);
  });
});

describe("isStuckWithoutProgress", () => {
  it("is false when writtenSoFar has advanced past the previous offset", () => {
    expect(
      isStuckWithoutProgress(0, { ...VALID_RESULT, writtenSoFar: 20 }),
    ).toBe(false);
  });

  it("is true when writtenSoFar has not advanced and done is still false", () => {
    expect(
      isStuckWithoutProgress(20, {
        ...VALID_RESULT,
        writtenSoFar: 20,
        done: false,
      }),
    ).toBe(true);
  });

  it("is true when writtenSoFar has gone backward", () => {
    expect(
      isStuckWithoutProgress(50, {
        ...VALID_RESULT,
        writtenSoFar: 10,
        done: false,
      }),
    ).toBe(true);
  });

  it("is false when done is true, even with no advancement (the legitimate empty-final-chunk case)", () => {
    expect(
      isStuckWithoutProgress(100, {
        ...VALID_RESULT,
        writtenSoFar: 100,
        done: true,
      }),
    ).toBe(false);
  });
});
