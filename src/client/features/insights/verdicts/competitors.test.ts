import { describe, expect, it } from "vitest";
import { buildCompetitorsVerdict, competitorsRowNote } from "./competitors";

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
        { domain: "x.com", intersections: null, organicKeywords: 100 },
        { domain: "y.com", intersections: null, organicKeywords: 200 },
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
        { domain: "rival-a.com", intersections: 300, organicKeywords: 400 },
        { domain: "rival-b.com", intersections: 50, organicKeywords: 2000 },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      "rival-a.com is your closest organic rival, sharing 300 keywords -- 75% of its own 400 ranked keywords overlap with yours.",
    );
    expect(verdict.actions).toEqual([
      {
        label: "Compare keywords with rival-a.com in the Keyword Gap tab",
        evidence: "300 shared keywords, 75% of rival-a.com's own 400",
        weight: 100,
      },
    ]);
  });

  it("picks the competitor with the highest shared-keyword count, not the first or the biggest by own footprint, and ignores one with an unknown count", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        {
          domain: "big-but-unknown.com",
          intersections: null,
          organicKeywords: 999999,
        },
        { domain: "small-known.com", intersections: 10, organicKeywords: 20 },
        {
          domain: "biggest-known.com",
          intersections: 80,
          organicKeywords: 100,
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
        { domain: "rival-c.com", intersections: 50, organicKeywords: 2000 },
      ],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "rival-c.com shares the most keywords with you among the competitors found (50), a modest slice of its own 2,000 ranked keywords.",
    );
    expect(verdict.actions).toEqual([
      {
        label: "Compare keywords with rival-c.com in the Keyword Gap tab",
        evidence: "50 shared keywords",
        weight: 80,
      },
    ]);
  });

  it("drops the share clause when the rival's own keyword count is unknown", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        { domain: "z.com", intersections: 10, organicKeywords: null },
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
        { domain: "rival-d.com", intersections: 2, organicKeywords: 500 },
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
        { domain: "rival-e.com", intersections: 1, organicKeywords: 500 },
      ],
    });

    expect(verdict.read).toContain("shares only 1 keyword with you");
  });

  it("stays bad one keyword below the weak-overlap floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        { domain: "rival-f.com", intersections: 4, organicKeywords: null },
      ],
    });

    expect(verdict.tone).toBe("bad");
  });

  it("flips to mixed exactly at the weak-overlap floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        { domain: "rival-g.com", intersections: 5, organicKeywords: null },
      ],
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("stays mixed one point below the strong-overlap-share floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        { domain: "rival-h.com", intersections: 199, organicKeywords: 400 },
      ],
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("flips to good exactly at the strong-overlap-share floor", () => {
    const verdict = buildCompetitorsVerdict({
      target: "acme.com",
      competitors: [
        { domain: "rival-i.com", intersections: 200, organicKeywords: 400 },
      ],
    });

    expect(verdict.tone).toBe("good");
  });
});

describe("competitorsRowNote", () => {
  it("states the keyword-overlap percentage", () => {
    expect(
      competitorsRowNote({ intersections: 50, organicKeywords: 200 }),
    ).toBe("25% keyword overlap");
  });

  it("says nothing when the shared-keyword count is missing", () => {
    expect(
      competitorsRowNote({ intersections: null, organicKeywords: 200 }),
    ).toBeNull();
  });

  it("says nothing when the rival's own keyword count is missing", () => {
    expect(
      competitorsRowNote({ intersections: 50, organicKeywords: null }),
    ).toBeNull();
  });

  it("says nothing when the rival's own keyword count is zero", () => {
    expect(
      competitorsRowNote({ intersections: 0, organicKeywords: 0 }),
    ).toBeNull();
  });
});
