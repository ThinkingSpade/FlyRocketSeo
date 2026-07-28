import { describe, expect, it } from "vitest";
import { resolveRunGeo, resolveStoredGeo } from "./resolveRunGeo";
import { resolveDefaultScopeArea } from "./resolveScopeArea";
import type { TargetArea } from "@/shared/geo/types";

const US = 2840;
const CANADA = 2124;

// Verified against seeded production data (the plan's own "two facts"
// section) -- 200623 is the real Dallas-Fort Worth DMA code; do not
// propagate the invented 1026339 some older fixtures still use.
const DFW: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: US,
};

describe("resolveRunGeo with no confirmed area (the default country passthrough)", () => {
  it("behaves exactly like no area at all for the session's own country", () => {
    const area = resolveDefaultScopeArea(US);
    expect(resolveRunGeo("keyword-volume", area, US)).toMatchObject({
      locationCode: US,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });

  it("follows a LIVE session location change rather than the area's stale default", () => {
    // The default scope area was built against US (e.g. the project's own
    // market resolved before the user touched anything), but this run's own
    // session selector has since moved to Canada -- the resolved geo must
    // describe Canada, not the area's embedded (now stale) US code.
    const staleDefaultArea = resolveDefaultScopeArea(US);
    expect(
      resolveRunGeo("keyword-volume", staleDefaultArea, CANADA),
    ).toMatchObject({
      locationCode: CANADA,
      scope: "national",
      label: "Canada",
    });
  });
});

describe("resolveRunGeo with a confirmed metro area matching the session country", () => {
  it("applies the metro locally for keyword volume", () => {
    expect(resolveRunGeo("keyword-volume", DFW, US)).toMatchObject({
      locationCode: 200623,
      provider: "google_ads",
      scope: "local",
      label: "Dallas-Ft. Worth, TX",
    });
  });

  it("keeps difficulty national even though the metro applies, because Labs is country-only", () => {
    expect(resolveRunGeo("keyword-difficulty", DFW, US)).toMatchObject({
      locationCode: US,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });
});

describe("resolveRunGeo with a confirmed metro area NOT matching the session country", () => {
  it("treats the area as absent -- falls back to the session's own country, not the metro", () => {
    // The tab's own "Location" selector has been pointed at Canada for a
    // one-off check, independent of the project's confirmed Dallas-Ft-Worth
    // target area. Applying the Texas DMA code to a Canada request would be
    // a nonsense mixed geography, so this must resolve as plain national
    // Canada -- exactly as it would with no target area confirmed at all.
    expect(resolveRunGeo("keyword-volume", DFW, CANADA)).toMatchObject({
      locationCode: CANADA,
      scope: "national",
      label: "Canada",
    });
  });

  it("never leaks the metro's provider/scope/label into the mismatched request", () => {
    const result = resolveRunGeo("serp", DFW, CANADA);
    expect(result.locationCode).not.toBe(DFW.locationCode);
    expect(result.scope).toBe("national");
  });
});

describe("resolveStoredGeo (labeling a restored run from its own stored location)", () => {
  it("labels a stored country-level code with its real country name", () => {
    expect(resolveStoredGeo("keyword-volume", US, "en")).toMatchObject({
      scope: "national",
      label: "United States",
    });
  });

  it("never re-applies the CURRENT live scope control -- ignores it entirely by signature", () => {
    // resolveStoredGeo takes no `area` argument at all: a restored run's
    // label can only ever come from what was actually stored, never from
    // whatever the header ScopeControl happens to show right now.
    const stored = resolveStoredGeo("keyword-volume", US, "en");
    expect(stored.scope).toBe("national");
  });

  it("degrades to an honestly empty label for a historical sub-country code it cannot name", () => {
    // 200623 (the real DFW DMA code) is not itself a LOCATION_OPTIONS
    // country row, so there is no cached human name to show -- this must
    // return an empty label (no suffix rendered), never a fabricated one.
    const stored = resolveStoredGeo("keyword-volume", 200_623, "en");
    expect(stored.label).toBe("");
  });
});
