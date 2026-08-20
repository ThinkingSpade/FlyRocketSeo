import { describe, expect, it } from "vitest";
import type { Action } from "../types";
import { buildCompetitorsVerdict } from "./competitors";

/** An action's `search`, narrowed to the merging-updater form -- a plain
 *  object would REPLACE the whole search and drop `target` (see
 *  competitors.test.ts for the full reasoning). */
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
 *  every other field exactly (see competitors.test.ts). */
function withoutSearchUpdater(action: Action) {
  const { to, ...rest } = action;
  return { ...rest, to: { to: to?.to } };
}

const ANALYZED_SEARCH = {
  target: "acme.com",
  tab: "competitors" as const,
  page: 3,
};

/** The rival added to the user's own target, never substituted for it, on the
 *  gap tab's first page -- same handoff domain mode makes. */
function expectKeywordGapHandoff(action: Action, competitor: string) {
  expect(searchUpdater(action)(ANALYZED_SEARCH)).toStrictEqual({
    target: "acme.com",
    tab: "gap",
    competitor,
    page: 1,
  });
}

/**
 * Serp-mode coverage for buildCompetitorsVerdict, split out of
 * competitors.test.ts once this pushed that file over this repo's
 * `max-lines` cap -- both files test the same `./competitors` module, split
 * by discovery mode rather than by an arbitrary line count.
 */
describe("buildCompetitorsVerdict (serp mode)", () => {
  it("says so when no competitor data was found", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.read).toBe("No competitor data is available for acme.com.");
  });

  it("says so when none of the competitors found have a measured position", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "x.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: null,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "None of the 1 competitors found for acme.com show a measured position against your own keywords, so there is no basis to say which one to chase.",
    );
  });

  it("calls it good when the closest rival beats the client on at least half of the seed", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-a.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 21,
        },
        {
          domain: "rival-b.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 5,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      "rival-a.com is your closest organic rival, outranking you on 21 of your 40 tracked keywords -- 53%.",
    );
    expect(verdict.actions.map(withoutSearchUpdater)).toEqual([
      {
        label: "Compare keywords with rival-a.com in the Keyword Gap tab",
        evidence: "Outranks you on 21 of your 40 tracked keywords, 53%",
        weight: 100,
        to: { to: "/p/$projectId/competitors" },
      },
    ]);
    // Same regression as domain mode: dropping the user's own target leaves
    // `useKeywordGapQuery` disabled, so the comparison never runs.
    expectKeywordGapHandoff(verdict.actions[0], "rival-a.com");
  });

  it("picks the candidate with the highest beatsYouCount, not intersections (always null here) or organicKeywords", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "biggest-footprint.com",
          intersections: null,
          organicKeywords: 999999,
          beatsYouCount: 3,
        },
        {
          domain: "beats-you-most.com",
          intersections: null,
          organicKeywords: 5,
          beatsYouCount: 30,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.read).toContain("beats-you-most.com");
    expect(verdict.read).toContain("30");
  });

  it("calls it mixed when the best beatsYouCount clears the weak floor but not the strong share", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-c.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 6,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "rival-c.com outranks you on more of your keywords than any other competitor found (6), out of 40 keywords tracked for this run.",
    );
    expect(verdict.actions.map(withoutSearchUpdater)).toEqual([
      {
        label: "Compare keywords with rival-c.com in the Keyword Gap tab",
        evidence: "Outranks you on 6 of your tracked keywords",
        weight: 80,
        to: { to: "/p/$projectId/competitors" },
      },
    ]);
    expectKeywordGapHandoff(verdict.actions[0], "rival-c.com");
  });

  it("drops the seed-size clause when seedSize is not provided", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-c.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 6,
        },
      ],
      discoveryMode: "serp",
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "rival-c.com outranks you on more of your keywords than any other competitor found (6).",
    );
  });

  it("calls it bad when even the best match barely outranks the client", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-d.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 2,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      "The closest match among the competitors found, rival-d.com, outranks you on only 2 of your keywords -- not enough to call it a clear rival to chase.",
    );
    expect(verdict.actions).toEqual([
      {
        label:
          "Broaden the competitor search before committing to a chase target",
        evidence:
          "Best rival found only outranks you on 2 of your tracked keywords",
        weight: 50,
      },
    ]);
  });

  it("stays bad on a genuine zero -- never fabricated, but never hidden either", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-e.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 0,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toContain("only 0 of your keywords");
  });

  it("flips to mixed exactly at the weak-overlap floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-f.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 5,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("flips to good exactly at the strong-overlap-share floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-g.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 20,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("good");
  });

  it("names the top REAL competitor, not the platform with the highest beatsYouCount -- the exact bug this batch fixes", () => {
    // Matches the bug report's own production shape: youtube.com beats the
    // client on more seed keywords than any genuine rival, but is not one.
    const verdict = buildCompetitorsVerdict({
      target: "americavending.com",
      competitors: [
        {
          domain: "youtube.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 6,
          category: "video",
        },
        {
          domain: "vendingexchange.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 3,
          category: null,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.read).toContain("vendingexchange.com");
    expect(verdict.read).not.toContain("youtube.com");
  });

  it("lets a pinned platform still be named -- a pin overrides the classifier (decision 4)", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "youtube.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 6,
          category: "video",
          pinned: true,
        },
        {
          domain: "realrival.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 3,
          category: null,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.read).toContain("youtube.com");
  });

  it("says so, without naming a platform, when every candidate found is a platform or aggregator", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "youtube.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 6,
          category: "video",
        },
        {
          domain: "facebook.com",
          intersections: null,
          organicKeywords: null,
          beatsYouCount: 5,
          category: "social",
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).not.toContain("youtube.com");
    expect(verdict.read).not.toContain("facebook.com");
  });

  it("ignores intersections entirely, even when a row somehow carries one, once discoveryMode is serp", () => {
    // Every real serp row has intersections: null (rankSerpCompetitors.ts
    // always sets it), but this pins the BRANCH, not just today's data
    // shape: a huge intersections value here must not leak into a "good"
    // verdict through the domain-mode code path.
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "rival-h.com",
          intersections: 999999,
          organicKeywords: 999999,
          beatsYouCount: 1,
        },
      ],
      discoveryMode: "serp",
      seedSize: 40,
    });

    expect(verdict.tone).toBe("bad");
  });
});
