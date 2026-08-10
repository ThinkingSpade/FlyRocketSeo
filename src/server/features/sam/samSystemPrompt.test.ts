import { describe, expect, it } from "vitest";

import { buildSamSystemPrompt } from "./samSystemPrompt";

const PROJECT = {
  projectId: "p1",
  projectName: "Delio TX",
  domain: "deliotx.com",
  locationCode: 2840,
  languageCode: "en",
};

const PROFILE = {
  offer: "Managed break room programs, vending and micro markets",
  customer: "Office and facility managers",
  exclusions: "We don't sell machines\nWe don't repair customer-owned machines",
  brandTerms: "Delio TX\ndeliotx",
};

/**
 * SAM knew a project's name, domain and market, and nothing about what the
 * business actually does -- so every new chat re-derived that by reading the
 * site, while the answer sat in `project_profiles` where the user had typed
 * it on the Keyword Research tab.
 */
describe("buildSamSystemPrompt", () => {
  it("tells SAM what the client sells and, crucially, what they do not", () => {
    const prompt = buildSamSystemPrompt(
      { ...PROJECT, profile: PROFILE },
      { memoryIsEmpty: true },
    );

    expect(prompt).toContain("Managed break room programs");
    expect(prompt).toContain("Office and facility managers");
    // The exclusions are the load-bearing half: a site read can recover what
    // a business does, but a page rarely states what it refuses to do.
    expect(prompt).toContain("We don't sell machines");
    expect(prompt).toContain("We don't repair customer-owned machines");
  });

  it("stops asking the user to confirm what they already typed", () => {
    const withProfile = buildSamSystemPrompt(
      { ...PROJECT, profile: PROFILE },
      { memoryIsEmpty: true },
    );
    // The intake script's give-away line. Right for a project nobody has
    // described; wrong for one whose owner already wrote it down.
    expect(withProfile).not.toContain("play it back as a short list of");
  });

  it("still runs the intake script for a project nobody has described", () => {
    const withoutProfile = buildSamSystemPrompt(
      { ...PROJECT, profile: null },
      { memoryIsEmpty: true },
    );
    expect(withoutProfile).toContain("play it back as a short list of");
  });

  it("says nothing about the business when every profile field is blank", () => {
    // A claimed-but-failed draft row confirmed by a user who saved it as-is.
    // An empty section asserting they described themselves would be a lie.
    const prompt = buildSamSystemPrompt(
      {
        ...PROJECT,
        profile: { offer: "", customer: "", exclusions: "", brandTerms: "" },
      },
      { memoryIsEmpty: true },
    );
    expect(prompt).not.toContain("The user has described this business");
    // ...and the intake script comes back, because there is still nothing
    // known about the business.
    expect(prompt).toContain("play it back as a short list of");
  });
});
