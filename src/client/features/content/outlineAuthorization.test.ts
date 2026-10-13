import { describe, expect, it } from "vitest";
import { outlineAuthorizationKey } from "./outlineAuthorization";

const brief = {
  keyword: "rocket guide",
  locationCode: 2840,
  languageCode: "en",
  fetchedAt: "2026-10-01T12:00:00.000Z",
  scope: {
    organizationId: "org-a",
    serpLocationCode: 2840,
    serpLanguageCode: "en",
  },
  competitors: [
    { url: "https://first.example/guide" },
    { url: "https://second.example/guide" },
  ],
};

describe("captured competitor-outline authorization", () => {
  it("cannot authorize absent briefs or empty URL sets", () => {
    expect(outlineAuthorizationKey("project-a", null, null)).toBeNull();
    expect(
      outlineAuthorizationKey(
        "project-a",
        { ...brief, competitors: [{ url: null }] },
        null,
      ),
    ).toBeNull();
  });

  it("keeps equivalent captured URL sets and scope ordering stable", () => {
    expect(
      outlineAuthorizationKey(
        "project-a",
        {
          ...brief,
          competitors: brief.competitors
            .toReversed()
            .concat(brief.competitors[0]),
          scope: {
            serpLanguageCode: "en",
            serpLocationCode: 2840,
            organizationId: "org-a",
          },
        },
        null,
      ),
    ).toBe(outlineAuthorizationKey("project-a", brief, null));
  });

  it.each([
    { keyword: "another rocket guide" },
    { locationCode: 2826 },
    { languageCode: "fr" },
    { fetchedAt: "2026-10-02T12:00:00.000Z" },
    { scope: { ...brief.scope, organizationId: "org-b" } },
    { scope: { ...brief.scope, serpLocationCode: 1026060 } },
    { scope: { ...brief.scope, serpLanguageCode: "fr" } },
    { competitors: [{ url: "https://third.example/guide" }] },
  ])("does not transfer consent to changed captured context %j", (change) => {
    expect(
      outlineAuthorizationKey("project-a", { ...brief, ...change }, null),
    ).not.toBe(outlineAuthorizationKey("project-a", brief, null));
  });

  it("revokes consent synchronously when a different history selection is pending", () => {
    expect(outlineAuthorizationKey("project-a", brief, "run-b")).not.toBe(
      outlineAuthorizationKey("project-a", brief, "run-a"),
    );
    expect(outlineAuthorizationKey("project-a", brief, "run-b")).not.toBe(
      outlineAuthorizationKey("project-a", brief, null),
    );
  });

  it("never transfers consent across projects", () => {
    expect(outlineAuthorizationKey("project-b", brief, null)).not.toBe(
      outlineAuthorizationKey("project-a", brief, null),
    );
  });
});
