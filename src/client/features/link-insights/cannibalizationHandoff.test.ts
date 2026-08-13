import { describe, expect, it } from "vitest";
import { linkOpportunitiesHandoff } from "./cannibalizationHandoff";

describe("linkOpportunitiesHandoff", () => {
  it("carries the card's query to the Link Opportunities tab", () => {
    expect(linkOpportunitiesHandoff("proj_1", "cold brew ratio")).toStrictEqual(
      {
        to: "/p/$projectId/links",
        params: { projectId: "proj_1" },
        search: { q: "cold brew ratio" },
      },
    );
  });

  /**
   * The inverse of the guard `backlinks.test.ts` puts on its own actions.
   * There, `search` MUST be a function, because those are same-route tab
   * switches and an object would drop the analyzed target. Here it must be an
   * object: this is a cross-route link, the destination validates `q` and
   * nothing else, and a merging updater would carry this page's OWN `q` --
   * the query being navigated away from -- into the destination.
   */
  it("sends search as a replacing object, not a merging updater", () => {
    const handoff = linkOpportunitiesHandoff("proj_1", "cold brew ratio");
    expect(typeof handoff?.search).toBe("object");
    expect(Object.keys(handoff?.search ?? {})).toStrictEqual(["q"]);
  });

  it("trims the query, because the receiver trims before matching a row", () => {
    expect(linkOpportunitiesHandoff("proj_1", "  cold brew  ")?.search).toEqual(
      {
        q: "cold brew",
      },
    );
  });

  /** `q` is `z.string().min(1).optional().catch(undefined)` on the links
   *  route, so a blank one lands as undefined and focuses nothing. */
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("offers no action for a %s query", (_label, query) => {
    expect(linkOpportunitiesHandoff("proj_1", query)).toBeNull();
  });

  it("keeps the query verbatim otherwise, casing and punctuation included", () => {
    expect(
      linkOpportunitiesHandoff("proj_1", "Best Coffee — Near Me?")?.search,
    ).toEqual({ q: "Best Coffee — Near Me?" });
  });
});
