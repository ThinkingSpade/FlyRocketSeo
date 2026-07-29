import { describe, expect, it } from "vitest";
import {
  mapIntersectionRows,
  summarizeNetworks,
} from "./backlinksCompareMappers";

const COMPETITORS = ["rival-a.com", "rival-b.com", "rival-c.com"];

function entry(overrides: Record<string, unknown> = {}) {
  return { target: "linker.com", rank: 55, backlinks: 3, ...overrides };
}

describe("mapIntersectionRows", () => {
  it("counts how many competitors a domain links to", () => {
    const rows = mapIntersectionRows(
      [{ domain_intersection: { "1": entry(), "3": entry() } }],
      COMPETITORS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].competitorsLinked).toBe(2);
  });

  it("maps the response keys back to the competitors they stand for", () => {
    const rows = mapIntersectionRows(
      [{ domain_intersection: { "1": entry(), "3": entry() } }],
      COMPETITORS,
    );
    expect(rows[0].linkedTo).toEqual(["rival-a.com", "rival-c.com"]);
  });

  it("reads the referring domain off the nested entry", () => {
    const rows = mapIntersectionRows(
      [
        {
          domain_intersection: {
            "1": entry({ target: "https://www.Linker.com/" }),
          },
        },
      ],
      COMPETITORS,
    );
    expect(rows[0].domain).toBe("linker.com");
  });

  it("totals the backlinks it points at every competitor", () => {
    const rows = mapIntersectionRows(
      [
        {
          domain_intersection: {
            "1": entry({ backlinks: 3 }),
            "2": entry({ backlinks: 7 }),
          },
        },
      ],
      COMPETITORS,
    );
    expect(rows[0].backlinks).toBe(10);
  });

  it("keeps the earliest first_seen across entries", () => {
    const rows = mapIntersectionRows(
      [
        {
          domain_intersection: {
            "1": entry({ first_seen: "2024-06-01" }),
            "2": entry({ first_seen: "2023-01-15" }),
          },
        },
      ],
      COMPETITORS,
    );
    expect(rows[0].firstSeen).toBe("2023-01-15");
  });

  it("takes the highest spam score rather than whichever arrives first", () => {
    const rows = mapIntersectionRows(
      [
        {
          domain_intersection: {
            "1": entry({ backlinks_spam_score: 12 }),
            "2": entry({ backlinks_spam_score: 71 }),
          },
        },
      ],
      COMPETITORS,
    );
    expect(rows[0].spamScore).toBe(71);
  });

  it("leaves optional numbers null instead of defaulting them to zero", () => {
    const rows = mapIntersectionRows(
      [{ domain_intersection: { "1": { target: "linker.com" } } }],
      COMPETITORS,
    );
    expect(rows[0].rank).toBeNull();
    expect(rows[0].backlinks).toBeNull();
    expect(rows[0].spamScore).toBeNull();
    expect(rows[0].firstSeen).toBeNull();
  });

  it("drops items with no intersection payload", () => {
    expect(mapIntersectionRows([{}], COMPETITORS)).toEqual([]);
    expect(
      mapIntersectionRows([{ domain_intersection: {} }], COMPETITORS),
    ).toEqual([]);
  });

  it("drops items whose entries carry no usable domain", () => {
    const rows = mapIntersectionRows(
      [{ domain_intersection: { "1": { rank: 10 } } }],
      COMPETITORS,
    );
    expect(rows).toEqual([]);
  });

  it("ignores a key with no matching competitor", () => {
    const rows = mapIntersectionRows(
      [{ domain_intersection: { "9": entry() } }],
      COMPETITORS,
    );
    expect(rows[0].competitorsLinked).toBe(0);
    expect(rows[0].linkedTo).toEqual([]);
    // The domain is still reported, because the link data is real.
    expect(rows[0].domain).toBe("linker.com");
  });
});

describe("summarizeNetworks", () => {
  it("sorts subnets by referring domains", () => {
    const summary = summarizeNetworks([
      { network_address: "10.0.1.0/24", referring_domains: 4 },
      { network_address: "10.0.2.0/24", referring_domains: 40 },
    ]);
    expect(summary.rows.map((row) => row.networkAddress)).toEqual([
      "10.0.2.0/24",
      "10.0.1.0/24",
    ]);
  });

  it("totals the referring domains across subnets", () => {
    const summary = summarizeNetworks([
      { network_address: "a", referring_domains: 4 },
      { network_address: "b", referring_domains: 6 },
    ]);
    expect(summary.totalDomains).toBe(10);
  });

  it("measures how much sits in the three biggest subnets", () => {
    const summary = summarizeNetworks([
      { network_address: "a", referring_domains: 30 },
      { network_address: "b", referring_domains: 30 },
      { network_address: "c", referring_domains: 20 },
      { network_address: "d", referring_domains: 10 },
      { network_address: "e", referring_domains: 10 },
    ]);
    expect(summary.topThreeShare).toBeCloseTo(0.8, 5);
  });

  it("reports a share of one when there are three or fewer subnets", () => {
    const summary = summarizeNetworks([
      { network_address: "a", referring_domains: 5 },
    ]);
    expect(summary.topThreeShare).toBe(1);
  });

  it("does not divide by zero when nothing has a domain count", () => {
    const summary = summarizeNetworks([{ network_address: "a" }]);
    expect(summary.totalDomains).toBe(0);
    expect(summary.topThreeShare).toBe(0);
  });

  it("drops rows with no network address", () => {
    expect(
      summarizeNetworks([{ referring_domains: 5 }, { network_address: "  " }])
        .rows,
    ).toEqual([]);
  });
});
