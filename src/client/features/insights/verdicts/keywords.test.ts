import { describe, expect, it } from "vitest";
import {
  buildKeywordsVerdict,
  buildTrendsVerdict,
  keywordRowNote,
} from "./keywords";

function buildRows(
  count: number,
  keywordDifficulty: (index: number) => number | null,
  searchVolume: (index: number) => number | null = () => 100,
) {
  return Array.from({ length: count }, (_, index) => ({
    keyword: `kw${index}`,
    searchVolume: searchVolume(index),
    keywordDifficulty: keywordDifficulty(index),
  }));
}

describe("buildKeywordsVerdict", () => {
  it("says so when there are no keyword results at all", () => {
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: [],
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      'No keyword results are available for "office coffee".',
    );
  });

  it("says so when the project's own domain rating is unknown", () => {
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(5, () => 20),
      ownDomainRating: null,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "This project's own domain rating is unknown, so there is no baseline to judge which of these keywords are winnable.",
    );
  });

  it("treats a domain rating of 0 as a real baseline, not as unknown", () => {
    // The regression this pins. americavending.com genuinely rates DR 0, and
    // `serverFunctions/ahrefs.ts` used to flatten that to null (`dr > 0 ? dr
    // : null`), so this banner announced "the domain rating is unknown" and
    // took the whole winnable/stretch/not-yet verdict down with it — for a
    // client whose authority was known, and known to be nil. Fixed server-side
    // in 85594f1; this is the guard that keeps the CLIENT half honest, because
    // a falsy check here (`!ownDomainRating`) would silently reintroduce the
    // exact same symptom while the server was doing the right thing.
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(5, () => 20),
      ownDomainRating: 0,
    });

    expect(verdict.tone).not.toBe("unknown");
    expect(verdict.read).not.toContain("domain rating is unknown");
    // With DR 0, nothing at difficulty 20 is within reach — and saying so is
    // the useful answer, not a shrug.
    expect(verdict.read).toContain("DR 0");
  });

  it("counts a zero-difficulty keyword as reachable for a DR 0 site", () => {
    // The other half of the same boundary: `keywordDifficulty <= ownDomainRating`
    // must stay inclusive, or a brand-new site would be told it can rank for
    // nothing at all even where the SERP is genuinely open.
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(5, () => 0),
      ownDomainRating: 0,
    });

    expect(verdict.tone).not.toBe("unknown");
    expect(verdict.read).not.toContain("domain rating is unknown");
  });

  it("declines to call it when no row has a known difficulty score", () => {
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(5, () => null),
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      'None of the 5 keyword results for "office coffee" have a known difficulty score, so there is nothing to judge winnability against.',
    );
  });

  it("declines to call it below the evidence floor (2 rated rows)", () => {
    const rows = [...buildRows(2, () => 20), ...buildRows(3, () => null)];
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows,
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      'Only 2 of 5 keyword results for "office coffee" have a known difficulty score -- too thin a sample to say which are winnable.',
    );
  });

  it("calls a verdict right at the evidence floor (3 rated rows)", () => {
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(3, () => 20),
      ownDomainRating: 40,
    });

    expect(verdict.tone).not.toBe("unknown");
  });

  it("calls it good when at least half the rated keywords are winnable", () => {
    const rows = buildRows(
      5,
      (i) => [10, 20, 30, 50, 60][i],
      (i) => [500, 100, 900, 50, 20][i],
    );
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows,
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      "3 of the 5 keywords with a known difficulty score (60%) are within reach of your DR 40 site.",
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Prioritize "kw2"',
        evidence: "Volume 900, difficulty 30 vs your DR 40",
        weight: 100,
        to: { to: "/p/$projectId/serp", search: { q: "kw2" } },
      },
    ]);
  });

  it("calls the winnable-majority boundary good at exactly 50%", () => {
    const rows = [...buildRows(50, () => 10), ...buildRows(50, () => 90)];
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows,
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("good");
  });

  it("calls it mixed just below the winnable-majority boundary (49%)", () => {
    const rows = [...buildRows(49, () => 10), ...buildRows(51, () => 90)];
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows,
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "Only 49 of the 100 keywords with a known difficulty score (49%) are within reach of your DR 40 site -- the rest need more authority than you currently have.",
    );
  });

  it("calls it bad and names the closest keyword when none are winnable", () => {
    const rows = buildRows(3, (i) => [70, 55, 90][i]);
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows,
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      "None of the 3 keywords with a known difficulty score are within reach of your DR 40 site.",
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Target "kw1" first',
        evidence:
          "Its difficulty score of 55 is the closest of this batch to your DR 40",
        weight: 100,
        to: { to: "/p/$projectId/serp", search: { q: "kw1" } },
      },
    ]);
  });

  it("falls back to the lowest-difficulty winnable keyword when none has volume", () => {
    const rows = buildRows(
      3,
      () => 10,
      () => null,
    );
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows,
      ownDomainRating: 40,
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.actions[0].label).toBe('Prioritize "kw0"');
    expect(verdict.actions[0].evidence).toBe("Difficulty 10 vs your DR 40");
  });
});

describe("buildKeywordsVerdict area labeling (Task 6)", () => {
  it("notes the national/local mismatch when the ideas were locally scoped", () => {
    const verdict = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(3, () => 20),
      ownDomainRating: 40,
      areaLabel: "Dallas-Ft. Worth, TX",
    });

    expect(verdict.read).toContain(
      "Difficulty reflects nationwide data; these keyword ideas are scoped to Dallas-Ft. Worth, TX.",
    );
  });

  it("says nothing extra for a national result -- identical to omitting the field", () => {
    const withNull = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(3, () => 20),
      ownDomainRating: 40,
      areaLabel: null,
    });
    const omitted = buildKeywordsVerdict({
      seed: "office coffee",
      rows: buildRows(3, () => 20),
      ownDomainRating: 40,
    });

    expect(withNull.read).toBe(omitted.read);
    expect(withNull.read).not.toContain("Dallas");
  });
});

describe("keywordRowNote", () => {
  it("says nothing when the row has no known difficulty score", () => {
    expect(
      keywordRowNote({ keywordDifficulty: null }, { ownDomainRating: 40 }),
    ).toBeNull();
  });

  it("says nothing when the project's own domain rating is unknown", () => {
    expect(
      keywordRowNote({ keywordDifficulty: 60 }, { ownDomainRating: null }),
    ).toBeNull();
  });

  it("says nothing for a keyword already within reach", () => {
    expect(
      keywordRowNote({ keywordDifficulty: 30 }, { ownDomainRating: 40 }),
    ).toBeNull();
  });

  it("states the gap for a keyword out of reach", () => {
    expect(
      keywordRowNote({ keywordDifficulty: 65 }, { ownDomainRating: 40 }),
    ).toBe("needs DR 65+");
  });
});

describe("buildTrendsVerdict", () => {
  it("says so when the tracked series doesn't span enough of the year", () => {
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: {},
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "The tracked series for coffee subscription doesn't span enough of the year to say when interest peaks.",
    );
  });

  it("declines below the evidence floor (5 of 12 months populated)", () => {
    const months = Array.from({ length: 12 }, () => null) as Array<
      number | null
    >;
    months[0] = 10;
    months[1] = 20;
    months[2] = 30;
    months[3] = 40;
    months[4] = 50;

    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "None of the tracked keywords (coffee subscription) have enough months of data to say when interest peaks.",
    );
  });

  it("reads a verdict right at the evidence floor (6 of 12 months populated)", () => {
    const months: Array<number | null> = [
      30,
      null,
      40,
      null,
      50,
      null,
      20,
      null,
      35,
      null,
      45,
      null,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).not.toBe("unknown");
  });

  it("calls it bad (flat) when the peak-to-low gap is under the flat floor", () => {
    const months: Array<number | null> = [
      52, 48, 50, 51, 49, 50, 47, 50, 51, 49, 50, 48,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toContain("coffee subscription");
    expect(verdict.read).toContain("flat");
  });

  it("calls the flat boundary mixed at exactly a 10-point gap", () => {
    const months: Array<number | null> = [
      55, 45, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("calls it mixed for a modest swing (15-point gap)", () => {
    // Peak 60 in March (index 2), low 45 in September (index 8).
    const months: Array<number | null> = [
      50, 55, 60, 55, 52, 50, 48, 46, 45, 48, 50, 52,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toContain("March");
    expect(verdict.read).toContain("September");
  });

  it("calls the meaningful-swing boundary good at exactly a 20-point gap", () => {
    const months: Array<number | null> = [
      60, 40, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).toBe("good");
  });

  it("calls it good and names a publish month for a clear seasonal peak", () => {
    // Peak 80 in December (index 11), low 20 in June (index 5).
    const months: Array<number | null> = [
      40, 35, 30, 25, 22, 20, 25, 30, 40, 55, 65, 80,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toContain("December");
    expect(verdict.read).toContain("June");
    expect(verdict.actions).toEqual([
      {
        label: 'Publish or refresh "coffee subscription" content by October',
        evidence: "coffee subscription's search interest peaks in December",
        weight: 100,
        to: {
          to: "/p/$projectId/content",
          search: { q: "coffee subscription" },
        },
      },
    ]);
  });

  it("leads with the keyword showing the strongest seasonal signal", () => {
    const flat: Array<number | null> = [
      50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50,
    ];
    const seasonal: Array<number | null> = [
      40, 35, 30, 25, 22, 20, 25, 30, 40, 55, 65, 80,
    ];
    const verdict = buildTrendsVerdict({
      keywords: ["flat term", "coffee subscription"],
      seriesByKeyword: { "flat term": flat, "coffee subscription": seasonal },
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toContain("coffee subscription");
    expect(verdict.read).not.toContain("flat term");
  });

  it("prefixes the read with the area when the run was locally scoped (Task 6)", () => {
    const months = Array.from({ length: 12 }, () => null) as Array<
      number | null
    >;
    [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].forEach((value, i) => {
      months[i] = value;
    });
    const verdict = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
      areaLabel: "Dallas-Ft. Worth, TX",
    });

    expect(verdict.read.startsWith("In Dallas-Ft. Worth, TX, ")).toBe(true);
  });

  it("says nothing extra for a worldwide result -- identical to omitting the field", () => {
    const months = Array.from({ length: 12 }, () => null) as Array<
      number | null
    >;
    [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].forEach((value, i) => {
      months[i] = value;
    });
    const withNull = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
      areaLabel: null,
    });
    const omitted = buildTrendsVerdict({
      keywords: ["coffee subscription"],
      seriesByKeyword: { "coffee subscription": months },
    });

    expect(withNull.read).toBe(omitted.read);
    expect(withNull.read.startsWith("In ")).toBe(false);
  });
});
