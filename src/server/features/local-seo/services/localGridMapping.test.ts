import { describe, expect, it } from "vitest";
import { mapLocalGridCell } from "./localGridMapping";

describe("mapLocalGridCell", () => {
  it("uses the local result group rank when absolute SERP position includes other elements", () => {
    expect(
      mapLocalGridCell(
        [
          {
            type: "local_pack",
            domain: "example.com",
            rank_group: 2,
            rank_absolute: 22,
          },
        ],
        "example.com",
      ).position,
    ).toBe(2);
  });
  it("does not report a negative or fractional target rank as a measured local rank", () => {
    for (const rank of [0, -1, 1.5, 21, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        mapLocalGridCell(
          [{ type: "local_pack", domain: "example.com", rank_group: rank }],
          "example.com",
        ).position,
      ).toBeNull();
    }
  });

  it("does not fill the top-three leaderboard using valid rows outside top three", () => {
    expect(
      mapLocalGridCell(
        [{ type: "local_pack", rank_group: 4, title: "Fourth place" }],
        "example.com",
      ).topCompetitors,
    ).toEqual([]);
  });
  const items = [
    {
      type: "local_finder",
      rank_group: 1,
      title: "Parks Coffee",
      domain: "www.parkscoffee.com",
    },
    {
      type: "local_finder",
      rank_group: 2,
      title: "Delio Vending",
      url: "https://deliotx.com/",
    },
    {
      type: "local_finder",
      rank_group: 3,
      title: "First Choice",
      domain: "firstchoiceservices.com",
    },
  ];

  it("finds the project's business by domain (via url fallback)", () => {
    const cell = mapLocalGridCell(items, "deliotx.com");
    expect(cell.position).toBe(2);
    expect(cell.topCompetitors).toEqual([
      "Parks Coffee",
      "Delio Vending",
      "First Choice",
    ]);
  });

  it("returns null when the business is absent and tolerates junk", () => {
    const cell = mapLocalGridCell(
      [...items, "junk", { title: "No rank" }],
      "othersite.com",
    );
    expect(cell.position).toBeNull();
    expect(cell.topCompetitors).toHaveLength(3);
  });

  it("matches www-prefixed project domains", () => {
    const cell = mapLocalGridCell(items, "www.parkscoffee.com");
    expect(cell.position).toBe(1);
  });
});
