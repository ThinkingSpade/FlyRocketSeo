import { describe, expect, it } from "vitest";
import { pickDiscoveryDisclosure } from "./pickDiscoveryDisclosure";
import type { CompetitorsPage } from "@/types/schemas/competitors";

const page = (overrides: Partial<CompetitorsPage> = {}): CompetitorsPage => ({
  rows: [],
  totalCount: 0,
  fetchedAt: "2026-08-10T00:00:00.000Z",
  seedSize: 0,
  hiddenCount: 0,
  discoveryMode: "domain",
  ...overrides,
});

describe("pickDiscoveryDisclosure", () => {
  it("prefers the live page over a restored one when both are present", () => {
    const result = pickDiscoveryDisclosure(
      page({ discoveryMode: "serp", seedSize: 20, hiddenCount: 1 }),
      {
        result: page({ discoveryMode: "domain", seedSize: 0, hiddenCount: 9 }),
      },
    );

    expect(result).toEqual({
      discoveryMode: "serp",
      seedSize: 20,
      hiddenCount: 1,
      hasResult: true,
    });
  });

  it("falls back to the restored page when there is no live data", () => {
    const result = pickDiscoveryDisclosure(undefined, {
      result: page({ discoveryMode: "serp", seedSize: 15, hiddenCount: 3 }),
    });

    expect(result).toEqual({
      discoveryMode: "serp",
      seedSize: 15,
      hiddenCount: 3,
      hasResult: true,
    });
  });

  it("reports no result and safe defaults when neither live nor restored data exists", () => {
    const result = pickDiscoveryDisclosure(undefined, null);

    expect(result).toEqual({
      discoveryMode: "domain",
      seedSize: 0,
      hiddenCount: 0,
      hasResult: false,
    });
  });

  it("still reports hasResult when the live page is a genuine empty answer (not undefined)", () => {
    const result = pickDiscoveryDisclosure(page({ hiddenCount: 0 }), null);

    expect(result.hasResult).toBe(true);
  });
});
