import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseStoredGeo,
  resolveRunGeo,
  resolveStoredGeo,
  toStoredMetricGeo,
} from "./resolveRunGeo";
import { resolveDefaultScopeArea } from "./resolveScopeArea";
import type { TargetArea } from "@/shared/geo/types";
import { storedMetricGeoSchema } from "@/types/schemas/geo";

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

  it("cannot tell a metro code from a country -- exactly why a restore no longer calls this function on a value that might be one", () => {
    // This test used to assert that feeding 200623 (the real DFW DMA code)
    // to resolveStoredGeo and getting back scope "national" with an empty
    // label was the CORRECT restore behaviour -- i.e. it blessed the bug
    // Codex found: a restored Dallas-Ft.-Worth run silently relabelled as
    // an unnamed national result, because this function has no way to know
    // 200623 was ever local. It now asserts the opposite: this is a
    // MISLEADING result (scope claims "national" when the real run was
    // local) that only happens because this function was called on a
    // value it cannot safely interpret. That is exactly why SERP Overview,
    // Content Optimizer, Keyword Research and Trends no longer call
    // `resolveStoredGeo` to restore a run that might have gone local --
    // they read the persisted per-metric bundle (`parseStoredGeo` below)
    // instead. `resolveStoredGeo` remains correct and in use ONLY where the
    // stored code is confirmed to already be a country (Topic Clusters'
    // `plan.locationCode` -- see resolveStoredGeo's own updated doc
    // comment), which is what the first two tests in this block cover.
    const stored = resolveStoredGeo("keyword-volume", 200_623, "en");
    expect(stored.scope).toBe("national");
    expect(stored.label).toBe("");
  });
});

describe("toStoredMetricGeo (packaging a captured geo for persistence)", () => {
  it("carries every field a later restore needs, including the parent country", () => {
    const geo = resolveRunGeo("keyword-volume", DFW, US);
    expect(toStoredMetricGeo(geo, US)).toEqual({
      locationCode: 200623,
      parentCountryCode: US,
      languageCode: "en",
      provider: "google_ads",
      scope: "local",
      label: "Dallas-Ft. Worth, TX",
    });
  });

  it("stamps the SAME parentCountryCode onto a national metric from the same capture", () => {
    // keyword-difficulty is NATIONAL_ONLY, so it resolves to the country
    // itself rather than the metro -- but the bundle still records which
    // session this was captured against, same as the local metric above.
    const geo = resolveRunGeo("keyword-difficulty", DFW, US);
    expect(toStoredMetricGeo(geo, US)).toMatchObject({
      locationCode: US,
      parentCountryCode: US,
      scope: "national",
    });
  });
});

describe("parseStoredGeo (validating a restored run's persisted geo bundle)", () => {
  const bundleSchema = z.object({
    v: z.literal(1),
    volume: storedMetricGeoSchema,
  });

  it("returns the parsed bundle from the params blob's own `geo` key", () => {
    // `params` here is a run's FULL restored params -- e.g. exactly what
    // TrendsService.ts's `recordRun` writes -- not the bundle itself; the
    // bundle always lives nested under `geo`, alongside the tab's other
    // canonical inputs.
    const stored = toStoredMetricGeo(
      resolveRunGeo("keyword-volume", DFW, US),
      US,
    );
    const params = {
      keyword: "coffee",
      locationCode: US,
      geo: { v: 1, volume: stored },
    };
    expect(parseStoredGeo(bundleSchema, params)).toEqual({
      v: 1,
      volume: stored,
    });
  });

  it("returns null for a run recorded before this bundle existed", () => {
    // The exact shape a pre-Defect-1 run's paramsJson parses to: real
    // fields, but no `geo` key at all.
    const params = { keyword: "coffee", locationCode: US };
    expect(parseStoredGeo(bundleSchema, params)).toBeNull();
  });

  it("returns null for a version mismatch rather than misreading an incompatible shape", () => {
    const stored = toStoredMetricGeo(
      resolveRunGeo("keyword-volume", DFW, US),
      US,
    );
    const params = { geo: { v: 2, volume: stored } };
    expect(parseStoredGeo(bundleSchema, params)).toBeNull();
  });

  it("returns null when a single metric is corrupt, rather than a partially-trusted bundle", () => {
    const params = { geo: { v: 1, volume: { locationCode: 200623 } } };
    expect(parseStoredGeo(bundleSchema, params)).toBeNull();
  });

  it("returns null for non-object params (corrupt JSON, not a parse failure)", () => {
    expect(parseStoredGeo(bundleSchema, null)).toBeNull();
    expect(parseStoredGeo(bundleSchema, "not an object")).toBeNull();
  });

  it("returns null when `geo` itself is present but not an object", () => {
    expect(parseStoredGeo(bundleSchema, { geo: null })).toBeNull();
  });
});
