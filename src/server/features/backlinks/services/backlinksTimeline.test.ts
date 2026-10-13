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
        newBacklinks: null,
        lostBacklinks: null,
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

  it("preserves unknown event fields and actual zero counts separately", () => {
    const points = mapBacklinksTimeline([
      { date: "2026-01-01", new_backlinks: null },
      {
        date: "2026-03-01",
        new_backlinks: 0,
        lost_backlinks: 0,
        new_referring_domains: 0,
        new_reffering_domains: 8,
        lost_referring_domains: 0,
        lost_reffering_domains: 5,
      },
    ]);
    expect(points).toEqual([
      {
        date: "2026-01-01",
        referringDomains: null,
        newReferringDomains: null,
        lostReferringDomains: null,
        newBacklinks: null,
        lostBacklinks: null,
      },
      {
        date: "2026-03-01",
        referringDomains: null,
        newReferringDomains: 0,
        lostReferringDomains: 0,
        newBacklinks: 0,
        lostBacklinks: 0,
      },
    ]);
  });

  it("drops impossible dates and treats invalid counts as unknown", () => {
    expect(
      mapBacklinksTimeline([
        { date: "not-a-date", new_backlinks: 1 },
        { date: "2026-02-30", new_backlinks: 1 },
        {
          date: "2026-02-01",
          referring_domains: -2,
          new_backlinks: Number.POSITIVE_INFINITY,
          lost_backlinks: -1,
          new_referring_domains: Number.NaN,
          lost_referring_domains: 1.5,
        },
      ]),
    ).toEqual([
      {
        date: "2026-02-01",
        referringDomains: null,
        newReferringDomains: null,
        lostReferringDomains: null,
        newBacklinks: null,
        lostBacklinks: null,
      },
    ]);
  });

  it("does not treat provider placeholder zeros before May 2021 as observed events", () => {
    const points = mapBacklinksTimeline([
      {
        date: "2021-04-01",
        referring_domains: 10,
        new_backlinks: 0,
        lost_backlinks: 0,
        new_referring_domains: 0,
        lost_referring_domains: 0,
      },
      {
        date: "2021-05-01",
        referring_domains: 10,
        new_backlinks: 0,
        lost_backlinks: 0,
        new_referring_domains: 0,
        lost_referring_domains: 0,
      },
    ]);
    expect(points[0]).toEqual({
      date: "2021-04-01",
      referringDomains: 10,
      newBacklinks: null,
      lostBacklinks: null,
      newReferringDomains: null,
      lostReferringDomains: null,
    });
    expect(points[1]).toEqual({
      date: "2021-05-01",
      referringDomains: 10,
      newBacklinks: 0,
      lostBacklinks: 0,
      newReferringDomains: 0,
      lostReferringDomains: 0,
    });
  });
});
