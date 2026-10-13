import { describe, expect, it } from "vitest";
import { buildComparison } from "./backlinksComparison";
import {
  mapIntersectionRows,
  summarizeNetworks,
} from "./backlinksCompareMappers";

const empty = {
  you: "example.com",
  competitors: [],
  ranks: [],
  backlinks: [],
  referringDomains: [],
  newLost: [],
  spamScores: [],
};
it("does not subtract an unreported new/lost count from an assumed zero", () => {
  const result = buildComparison({
    ...empty,
    newLost: [{ target: "example.com", new_referring_domains: 8 }],
  });
  expect(result.rows[0]).toMatchObject({
    newReferringDomains: 8,
    lostReferringDomains: null,
    netReferringDomains: null,
  });
});
it("keeps invalid comparison observations unknown and genuine zero known", () => {
  const result = buildComparison({
    ...empty,
    ranks: [{ target: "example.com", rank: 150 }],
    backlinks: [{ target: "example.com", backlinks: 1.5 }],
    referringDomains: [{ target: "example.com", referring_domains: -1 }],
    newLost: [
      {
        target: "example.com",
        new_referring_domains: 0,
        lost_referring_domains: 0,
      },
    ],
    spamScores: [{ target: "example.com", spam_score: NaN }],
  });
  expect(result.rows[0]).toMatchObject({
    rank: null,
    backlinks: null,
    referringDomains: null,
    spamScore: null,
    netReferringDomains: 0,
  });
});
describe("link intersections", () => {
  it("keeps a partially reported backlink total unknown", () => {
    expect(
      mapIntersectionRows(
        [
          {
            domain_intersection: {
              "1": { target: "linker.example", backlinks: 4 },
              "2": { target: "linker.example" },
            },
          },
        ],
        ["one.example", "two.example"],
      )[0].backlinks,
    ).toBeNull();
  });
  it("does not include unrequested or mismatched nested targets", () => {
    expect(
      mapIntersectionRows(
        [
          {
            domain_intersection: {
              "99": { target: "foreign.example", backlinks: 99 },
            },
          },
        ],
        ["one.example"],
      ),
    ).toEqual([]);
    expect(
      mapIntersectionRows(
        [
          {
            domain_intersection: {
              "1": { target: "one-linker.example" },
              "2": { target: "different-linker.example" },
            },
          },
        ],
        ["one.example", "two.example"],
      ),
    ).toEqual([]);
  });
});
describe("network coverage", () => {
  it("does not certify completeness without the universe size", () => {
    expect(
      summarizeNetworks([{ network_address: "a", referring_domains: 5 }], null),
    ).toMatchObject({ isComplete: false });
  });
  it("does not infer concentration from absent or invalid counts", () => {
    expect(
      summarizeNetworks(
        [
          { network_address: "a", referring_domains: 3 },
          { network_address: "b", referring_domains: null },
        ],
        2,
      ),
    ).toMatchObject({
      totalDomains: null,
      topThreeShare: null,
      isComplete: false,
    });
    expect(
      summarizeNetworks([{ network_address: "a", referring_domains: 1.5 }], 1),
    ).toMatchObject({
      totalDomains: null,
      topThreeShare: null,
      isComplete: false,
    });
  });
});
