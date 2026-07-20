import { describe, expect, it } from "vitest";
import { mapLocalGridCell } from "./localGridMapping";

describe("mapLocalGridCell", () => {
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
