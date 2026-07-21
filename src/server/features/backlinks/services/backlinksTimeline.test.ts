import { describe, expect, it } from "vitest";
import { mapBacklinksTimeline } from "./backlinksTimeline";

describe("mapBacklinksTimeline", () => {
  it("maps rows oldest-first and reads both referring-domain spellings", () => {
    const points = mapBacklinksTimeline([
      {
        date: "2026-06-01 00:00:00 +00:00",
        referring_domains: 120,
        new_referring_domains: 8,
        lost_referring_domains: 3,
        new_backlinks: 40,
        lost_backlinks: 12,
      },
      {
        date: "2026-05-01 00:00:00 +00:00",
        referring_domains: 115,
        new_reffering_domains: 5,
        lost_reffering_domains: 2,
      },
      { rank: 10 },
    ]);

    expect(points).toEqual([
      {
        date: "2026-05-01",
        referringDomains: 115,
        newReferringDomains: 5,
        lostReferringDomains: 2,
        newBacklinks: 0,
        lostBacklinks: 0,
      },
      {
        date: "2026-06-01",
        referringDomains: 120,
        newReferringDomains: 8,
        lostReferringDomains: 3,
        newBacklinks: 40,
        lostBacklinks: 12,
      },
    ]);
  });
});
