import { describe, expect, it } from "vitest";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";
import { resolveLabsLocationCode } from "@/server/lib/labs-location";

// Real values verified against the source CSV (see
// .superpowers/sdd/task-8-brief.md) -- do not change them to make a failing
// implementation pass.
const TEXAS = 21176;
const DALLAS_TX = 1026339;

describe("resolveLabsLocationCode", () => {
  it("passes a Labs-supported country through unchanged", () => {
    expect(resolveLabsLocationCode(DEFAULT_LOCATION_CODE)).toBe(
      DEFAULT_LOCATION_CODE,
    );
  });

  it("resolves a state up to its country", () => {
    expect(resolveLabsLocationCode(TEXAS)).toBe(DEFAULT_LOCATION_CODE);
  });

  // Two hops: city -> state -> country. A single-parent read fails this.
  it("walks a city all the way up to its country", () => {
    expect(resolveLabsLocationCode(DALLAS_TX)).toBe(DEFAULT_LOCATION_CODE);
  });

  it("falls back to the default for an unknown code", () => {
    expect(resolveLabsLocationCode(99999999)).toBe(DEFAULT_LOCATION_CODE);
  });
});
