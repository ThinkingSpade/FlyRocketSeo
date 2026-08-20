import { describe, expect, it } from "vitest";
import { rankTrackingHandoff } from "./rankTrackingHandoff";

describe("rankTrackingHandoff", () => {
  it("carries the row's domain to the Rank Tracking tab", () => {
    expect(rankTrackingHandoff("proj_1", "competitor.com")).toStrictEqual({
      to: "/p/$projectId/rank-tracking",
      params: { projectId: "proj_1" },
      search: { domain: "competitor.com" },
    });
  });

  /**
   * The inverse of the guard `backlinks.test.ts` puts on its own actions --
   * see `linkOpportunitiesHandoff`'s equivalent test. Same-route tab switches
   * need the merging function form; this cross-route link needs the replacing
   * object, because the destination declares `domain` and nothing else.
   */
  it("sends search as a replacing object, not a merging updater", () => {
    const handoff = rankTrackingHandoff("proj_1", "competitor.com");
    expect(typeof handoff.search).toBe("object");
    expect(Object.keys(handoff.search)).toStrictEqual(["domain"]);
  });

  /**
   * `rank-tracking/index.tsx` runs `safeNormalizeDomain` over `?domain=`
   * itself, both to match an existing tracker and to prefill the create form.
   * Normalizing here as well is how the two ends drift apart, so anything the
   * row holds goes over untouched.
   */
  it.each([
    ["a scheme and path", "https://Competitor.com/pricing"],
    ["a www prefix", "www.Competitor.com"],
    ["mixed case", "CoMpEtItOr.com"],
  ])(
    "passes %s through raw for the receiver to normalize",
    (_label, domain) => {
      expect(rankTrackingHandoff("proj_1", domain).search).toEqual({ domain });
    },
  );

  it("scopes the link to the project it was rendered in", () => {
    expect(rankTrackingHandoff("proj_2", "competitor.com").params).toEqual({
      projectId: "proj_2",
    });
  });
});
