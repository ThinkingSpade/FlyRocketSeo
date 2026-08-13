import { describe, expect, it } from "vitest";
import type { Action } from "../types";
import { buildBacklinksVerdict, backlinksRowNote } from "./backlinks";

/**
 * An action's `search`, narrowed to the merging-updater form.
 *
 * `functionalUpdate` (@tanstack/router-core) MERGES a function and REPLACES
 * the whole search with a plain object, so an object here silently drops the
 * analyzed `target` these same-route actions land on. Throwing rather than
 * returning null keeps that failure loud in every assertion below.
 */
function searchUpdater(action: Action) {
  const search = action.to?.search;
  if (typeof search !== "function") {
    throw new TypeError(
      `"${action.label}" must carry a search updater function; a plain object replaces the entire search`,
    );
  }
  return search;
}

/** An action with its `search` updater dropped, so `toEqual` can still pin
 *  every other field exactly: two functions are never `toEqual`, and
 *  `expect.any(Function)` is an `any`. The updater is asserted separately, for
 *  what it does. */
function withoutSearchUpdater(action: Action) {
  const { to, ...rest } = action;
  return { ...rest, to: { to: to?.to } };
}

/** A Backlinks URL mid-analysis: a target is loaded and the user is deep in a
 *  sorted list on the default tab. */
const ANALYZED_SEARCH = {
  target: "acme.com",
  scope: "domain" as const,
  tab: "backlinks" as const,
  page: 3,
  sort: "domainRank",
  order: "desc" as const,
};

/** What every action here must do to the URL it navigates from: switch tab,
 *  keep the analyzed target and its scope, and clear the per-tab position the
 *  page's own tab switcher clears. */
function expectTabHandoff(action: Action, tab: "pages" | "domains") {
  expect(searchUpdater(action)(ANALYZED_SEARCH)).toStrictEqual({
    target: "acme.com",
    scope: "domain",
    tab,
    page: undefined,
    sort: undefined,
    order: undefined,
  });
}

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
    expect(verdict.actions.map(withoutSearchUpdater)).toEqual([
      {
        label: "Redirect or restore the 142 broken backlink targets",
        evidence: "142 of 1,200 backlinks (12%) point at dead pages",
        weight: 100,
        to: { to: "/p/$projectId/backlinks" },
      },
    ]);
    expectTabHandoff(verdict.actions[0], "pages");
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
    expect(withoutSearchUpdater(verdict.actions[0])).toEqual({
      label: "Redirect or restore the 142 broken backlink targets",
      evidence: "142 of 1,200 backlinks (12%) point at dead pages",
      weight: 100,
      to: { to: "/p/$projectId/backlinks" },
    });
    expect(withoutSearchUpdater(verdict.actions[1])).toEqual({
      label:
        "Review the referring domains behind this backlink profile for spam",
      evidence: "Backlink spam score 42/100 · Worth reviewing",
      weight: 70,
      to: { to: "/p/$projectId/backlinks" },
    });
    // Both land on another tab of the page they are rendered on, so both must
    // keep the target that page is analyzing.
    expectTabHandoff(verdict.actions[0], "pages");
    expectTabHandoff(verdict.actions[1], "domains");
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
    expect(verdict.actions.map(withoutSearchUpdater)).toEqual([
      {
        label: "Redirect or restore the 8 broken backlink targets",
        evidence: "8 backlinks point at dead pages",
        weight: 100,
        to: { to: "/p/$projectId/backlinks" },
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

  it("keeps the analyzed target when the broken-links action switches tab", () => {
    const verdict = buildBacklinksVerdict({
      target: "acme.com",
      backlinks: 1200,
      referringDomains: 340,
      brokenBacklinks: 3,
      backlinksSpamScore: null,
    });

    // Regression: this action used to carry `search: { tab: "pages" }`, and a
    // plain object REPLACES the whole search rather than merging into it. The
    // target vanished, the overview and top-pages queries disabled, and the
    // page collapsed to its restored-run summary -- whose only route back to
    // the rows that were on screen a second earlier is a METERED re-fetch.
    expectTabHandoff(verdict.actions[0], "pages");
  });

  it("keeps the analyzed target when the spam-review action switches tab", () => {
    const verdict = buildBacklinksVerdict({
      target: "acme.com",
      backlinks: 1200,
      referringDomains: 340,
      brokenBacklinks: 0,
      backlinksSpamScore: 55,
    });

    expectTabHandoff(verdict.actions[0], "domains");
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
