import { describe, expect, it } from "vitest";
import { buildBacklinksVerdict, backlinksRowNote } from "./backlinks";

describe("buildBacklinksVerdict", () => {
  it("says so when there is no backlink profile data at all", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: null,
      referringDomains: null,
      brokenBacklinks: null,
      backlinksSpamScore: null,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "No backlink data is available for example.com, so there is nothing to judge the link profile against.",
    );
  });

  it("says so when the profile exists but neither broken-link nor spam data is present", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 500,
      referringDomains: 120,
      brokenBacklinks: null,
      backlinksSpamScore: null,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "Backlink and referring-domain counts are available for example.com, but neither broken-backlink nor spam-score data is present, so there is nothing to judge recoverability or spam risk against.",
    );
  });

  it("calls the profile good when nothing is broken and spam risk is low", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 1200,
      referringDomains: 340,
      brokenBacklinks: 0,
      backlinksSpamScore: 5,
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      "No backlinks currently point at broken pages. The backlink spam score is 5/100 · Low signal.",
    );
    expect(verdict.actions).toEqual([]);
  });

  it("calls the profile mixed when broken links are recoverable but spam risk is low", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 1200,
      referringDomains: 340,
      brokenBacklinks: 142,
      backlinksSpamScore: 10,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "142 of your 1,200 backlinks (12%) point at pages that no longer exist -- redirecting or restoring them recovers links you already earned. The backlink spam score is 10/100 · Low signal.",
    );
    expect(verdict.actions).toEqual([
      {
        label: "Redirect or restore the 142 broken backlink targets",
        evidence: "142 of 1,200 backlinks (12%) point at dead pages",
        weight: 100,
        to: { to: "/p/$projectId/backlinks", search: { tab: "pages" } },
      },
    ]);
  });

  it("calls the profile mixed when spam is worth reviewing, and ranks the broken-link action above the spam action", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 1200,
      referringDomains: 340,
      brokenBacklinks: 142,
      backlinksSpamScore: 42,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "142 of your 1,200 backlinks (12%) point at pages that no longer exist -- redirecting or restoring them recovers links you already earned. The backlink spam score is 42/100 · Worth reviewing.",
    );
    expect(verdict.actions).toHaveLength(2);
    expect(verdict.actions[0]).toEqual({
      label: "Redirect or restore the 142 broken backlink targets",
      evidence: "142 of 1,200 backlinks (12%) point at dead pages",
      weight: 100,
      to: { to: "/p/$projectId/backlinks", search: { tab: "pages" } },
    });
    expect(verdict.actions[1]).toEqual({
      label:
        "Review the referring domains behind this backlink profile for spam",
      evidence: "Backlink spam score 42/100 · Worth reviewing",
      weight: 70,
      to: { to: "/p/$projectId/backlinks", search: { tab: "domains" } },
    });
    // Broken-link recovery is free (links already earned); it must always
    // outrank a spam review, which only makes something worse look better.
    expect(verdict.actions[0].weight).toBeGreaterThan(
      verdict.actions[1].weight,
    );
  });

  it("uses the low-signal tier through 29", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 100,
      referringDomains: 40,
      brokenBacklinks: 5,
      backlinksSpamScore: 29,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toContain("spam score is 29/100 · Low signal");
  });

  it("uses the review tier from 30", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 100,
      referringDomains: 40,
      brokenBacklinks: 5,
      backlinksSpamScore: 30,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toContain("spam score is 30/100 · Worth reviewing");
  });

  it("uses the high-risk tier from 60", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 100,
      referringDomains: 40,
      brokenBacklinks: 0,
      backlinksSpamScore: 60,
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toContain("spam score is 60/100 · High-risk signal");
  });

  it("states broken-link count without a percentage when the total backlink count is unknown", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: null,
      referringDomains: 50,
      brokenBacklinks: 8,
      backlinksSpamScore: null,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "8 backlinks point at pages that no longer exist -- redirecting or restoring them recovers links you already earned.",
    );
    expect(verdict.actions).toEqual([
      {
        label: "Redirect or restore the 8 broken backlink targets",
        evidence: "8 backlinks point at dead pages",
        weight: 100,
        to: { to: "/p/$projectId/backlinks", search: { tab: "pages" } },
      },
    ]);
  });

  it("uses singular wording for exactly one broken backlink", () => {
    const verdict = buildBacklinksVerdict({
      target: "example.com",
      backlinks: 1000,
      referringDomains: 200,
      brokenBacklinks: 1,
      backlinksSpamScore: null,
    });

    expect(verdict.actions[0].label).toBe(
      "Redirect or restore the 1 broken backlink target",
    );
  });
});

describe("backlinksRowNote", () => {
  it("flags a broken row as recoverable", () => {
    expect(backlinksRowNote({ isBroken: true })).toBe("recoverable");
  });

  it("says nothing for a row that is not broken", () => {
    expect(backlinksRowNote({ isBroken: false })).toBeNull();
  });
});
