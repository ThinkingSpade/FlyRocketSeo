import { describe, expect, it } from "vitest";
import type { Action } from "../types";
import { buildCompetitorsVerdict } from "./competitors";

/**
 * An action's `search`, narrowed to the merging-updater form.
 *
 * `functionalUpdate` (@tanstack/router-core) MERGES a function and REPLACES
 * the whole search with a plain object, so an object here silently drops the
 * `target` this same-route action lands on -- and `useKeywordGapQuery` is
 * `enabled: ... && target !== "" && competitor !== ""`, so the gap it just
 * offered to open would never run.
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

/** A Competitors URL mid-analysis: the user's own domain analyzed, and the
 *  user three pages into the competitor list. */
const ANALYZED_SEARCH = {
  target: "acme.com",
  tab: "competitors" as const,
  page: 3,
};

/** What every compare action here must do to the URL it navigates from: add
 *  the rival to the user's own target rather than replace it, open the gap
 *  tab, and start that different data set at its first page (as the page's own
 *  Compare-competitor row action does). */
function expectKeywordGapHandoff(action: Action, competitor: string) {
  expect(searchUpdater(action)(ANALYZED_SEARCH)).toStrictEqual({
    target: "acme.com",
    tab: "gap",
    competitor,
    page: 1,
  });
}

describe("buildCompetitorsVerdict", () => {
  it("says so when no competitor data was found", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe("No competitor data is available for acme.com.");
  });

  it("says so when none of the competitors found have a known shared-keyword count", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "x.com",
          intersections: null,
          organicKeywords: 100,
          beatsYouCount: null,
        },
        {
          domain: "y.com",
          intersections: null,
          organicKeywords: 200,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "None of the 2 competitors found for acme.com have a known shared-keyword count, so there is no basis to say which one to chase.",
    );
  });

  it("calls it good when the closest rival shares at least half of its own keywords", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-a.com",
          intersections: 300,
          organicKeywords: 400,
          beatsYouCount: null,
        },
        {
          domain: "rival-b.com",
          intersections: 50,
          organicKeywords: 2000,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      "rival-a.com is your closest organic rival, sharing 300 keywords -- 75% of its own 400 ranked keywords overlap with yours.",
    );
    expect(verdict.actions.map(withoutSearchUpdater)).toEqual([
      {
        label: "Compare keywords with rival-a.com in the Keyword Gap tab",
        evidence: "300 shared keywords, 75% of rival-a.com's own 400",
        weight: 100,
        to: { to: "/p/$projectId/competitors" },
      },
    ]);
    expectKeywordGapHandoff(verdict.actions[0], "rival-a.com");
  });

  it("picks the competitor with the highest shared-keyword count, not the first or the biggest by own footprint, and ignores one with an unknown count", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "big-but-unknown.com",
          intersections: null,
          organicKeywords: 999999,
          beatsYouCount: null,
        },
        {
          domain: "small-known.com",
          intersections: 10,
          organicKeywords: 20,
          beatsYouCount: null,
        },
        {
          domain: "biggest-known.com",
          intersections: 80,
          organicKeywords: 100,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toContain("biggest-known.com");
    expect(verdict.read).toContain("80 keywords");
  });

  it("calls it mixed when the best overlap is a modest slice of the rival's own footprint", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-c.com",
          intersections: 50,
          organicKeywords: 2000,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "rival-c.com shares the most keywords with you among the competitors found (50), a modest slice of its own 2,000 ranked keywords.",
    );
    expect(verdict.actions.map(withoutSearchUpdater)).toEqual([
      {
        label: "Compare keywords with rival-c.com in the Keyword Gap tab",
        evidence: "50 shared keywords",
        weight: 80,
        to: { to: "/p/$projectId/competitors" },
      },
    ]);
    expectKeywordGapHandoff(verdict.actions[0], "rival-c.com");
  });

  it("keeps the user's own domain when the compare action opens the Keyword Gap tab", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-a.com",
          intersections: 300,
          organicKeywords: 400,
          beatsYouCount: null,
        },
      ],
    });

    // Regression: this action used to carry `search: { tab, competitor }`, and
    // a plain object REPLACES the whole search rather than merging into it. It
    // filled in the rival, dropped the user's own domain, and the gap query --
    // `enabled: ... && target !== "" && competitor !== ""` -- never ran.
    expectKeywordGapHandoff(verdict.actions[0], "rival-a.com");
  });

  it("drops the share clause when the rival's own keyword count is unknown", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "z.com",
          intersections: 10,
          organicKeywords: null,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "z.com shares the most keywords with you among the competitors found (10).",
    );
  });

  it("calls it bad when even the best match shares too few keywords to be a clear rival", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-d.com",
          intersections: 2,
          organicKeywords: 500,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      "The closest match among the competitors found, rival-d.com, shares only 2 keywords with you -- not enough overlap to call it a clear rival to chase.",
    );
    expect(verdict.actions).toEqual([
      {
        label:
          "Broaden the competitor search before committing to a chase target",
        evidence: "Best overlap found is only 2 shared keywords",
        weight: 50,
      },
    ]);
  });

  it("uses singular wording for exactly one shared keyword", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-e.com",
          intersections: 1,
          organicKeywords: 500,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.read).toContain("shares only 1 keyword with you");
  });

  it("stays bad one keyword below the weak-overlap floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-f.com",
          intersections: 4,
          organicKeywords: null,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("bad");
  });

  it("flips to mixed exactly at the weak-overlap floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-g.com",
          intersections: 5,
          organicKeywords: null,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("stays mixed one point below the strong-overlap-share floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-h.com",
          intersections: 199,
          organicKeywords: 400,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("flips to good exactly at the strong-overlap-share floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-i.com",
          intersections: 200,
          organicKeywords: 400,
          beatsYouCount: null,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
  });

  it("names the top REAL competitor in domain mode too, not a platform with a bigger shared-keyword count", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "wikipedia.org",
          intersections: 500,
          organicKeywords: 900,
          beatsYouCount: null,
          category: "education",
        },
        {
          domain: "realrival.com",
          intersections: 80,
          organicKeywords: 100,
          beatsYouCount: null,
          category: null,
        },
      ],
    });

    expect(verdict.read).toContain("realrival.com");
    expect(verdict.read).not.toContain("wikipedia.org");
  });

  it("defaults to domain-mode reading (intersections) when discoveryMode is omitted", () => {
    // No caller in this describe block passes discoveryMode at all -- this
    // pins down that the omission itself means "domain", not merely that
    // domain-shaped fixtures happen to produce a domain-shaped answer.
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-j.com",
          intersections: 50,
          organicKeywords: null,
          // A nonsense serp-mode value on a row read as domain-mode must be
          // ignored entirely -- proves the branch, not just the field.
          beatsYouCount: 999,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toContain("shares the most keywords");
  });
});
