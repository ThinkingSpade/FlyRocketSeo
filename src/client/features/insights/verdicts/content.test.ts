import { describe, expect, it } from "vitest";
import { buildClustersVerdict, buildContentVerdict } from "./content";

describe("buildContentVerdict", () => {
  it("says so when there is no draft to grade yet", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: null,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      'Paste a draft below to see what it\'s missing compared to the top-ranking pages for "office coffee".',
    );
  });

  it("says so when a draft exists but the brief has nothing to grade it against", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: null,
      currentWordCount: 500,
      missingSubtopics: [],
      totalSubtopics: 0,
      unansweredQuestions: [],
      totalQuestions: 0,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      'There is nothing in this brief yet to grade your draft against for "office coffee" -- no target length, subtopics, or questions are available.',
    );
  });

  it("calls it good when the draft clears every checked dimension", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 1000,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      'Your draft for "office coffee" meets the 1,000-word median across analyzed top pages, covers all 4 recurring subtopics, and answers all 3 searcher questions.',
    );
  });

  it("calls the length-gap boundary clear right at 10% short", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 900,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("does not count a draft just inside the length-gap boundary (9.9% short)", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 901,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
    });

    expect(verdict.tone).toBe("good");
  });

  it("calls it mixed with exactly one gap (word count short)", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 800,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      'Your draft for "office coffee" is 200 words short of the 1,000-word median across analyzed top pages, covers all 4 recurring subtopics, and answers all 3 searcher questions.',
    );
    expect(verdict.actions).toEqual([
      {
        label: "Add roughly 200 words to reach the ~1,000-word target",
        evidence:
          "Current draft is 800 words vs a 1,000-word median across analyzed top-ranking pages",
        weight: 100,
      },
    ]);
  });

  it("calls it bad with two simultaneous gaps (word count and subtopics)", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 800,
      missingSubtopics: ["Pricing", "Setup"],
      totalSubtopics: 5,
      unansweredQuestions: [],
      totalQuestions: 2,
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      'Your draft for "office coffee" is 200 words short of the 1,000-word median across analyzed top pages, is missing 2 of 5 recurring subtopics, and answers all 2 searcher questions.',
    );
    expect(verdict.actions).toEqual([
      {
        label: "Add roughly 200 words to reach the ~1,000-word target",
        evidence:
          "Current draft is 800 words vs a 1,000-word median across analyzed top-ranking pages",
        weight: 100,
      },
      {
        label: 'Cover 2 missing subtopics, starting with "Pricing"',
        evidence:
          "2 of 5 recurring sections top-ranking pages cover are missing from your draft",
        weight: 80,
      },
    ]);
  });

  it("calls it bad with three simultaneous gaps", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 800,
      missingSubtopics: ["Pricing"],
      totalSubtopics: 5,
      unansweredQuestions: ["How much does office coffee service cost?"],
      totalQuestions: 2,
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.actions).toEqual([
      {
        label: "Add roughly 200 words to reach the ~1,000-word target",
        evidence:
          "Current draft is 800 words vs a 1,000-word median across analyzed top-ranking pages",
        weight: 100,
      },
      {
        label: 'Cover the missing subtopic: "Pricing"',
        evidence:
          "1 of 5 recurring sections top-ranking pages cover is missing from your draft",
        weight: 80,
      },
      {
        label: 'Answer "How much does office coffee service cost?"',
        evidence: "1 of 2 searcher questions aren't addressed in your draft",
        weight: 60,
      },
    ]);
  });

  it("only grades the dimensions the brief actually has data for", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: null,
      currentWordCount: 800,
      missingSubtopics: [],
      totalSubtopics: 0,
      unansweredQuestions: [],
      totalQuestions: 3,
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      'Your draft for "office coffee" answers all 3 searcher questions.',
    );
  });
});

describe("buildContentVerdict area labeling (Task 6)", () => {
  it("prefixes the read with the area when competitors were locally scoped", () => {
    const verdict = buildContentVerdict({
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 1000,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
      areaLabel: "Dallas-Ft. Worth, TX",
    });

    expect(verdict.read.startsWith("In Dallas-Ft. Worth, TX, your draft")).toBe(
      true,
    );
  });

  it("says nothing extra for a national result -- identical to omitting the field", () => {
    const base = {
      keyword: "office coffee",
      targetWordCount: 1000,
      currentWordCount: 1000,
      missingSubtopics: [],
      totalSubtopics: 4,
      unansweredQuestions: [],
      totalQuestions: 3,
    };
    const withNull = buildContentVerdict({ ...base, areaLabel: null });
    const omitted = buildContentVerdict(base);

    expect(withNull.read).toBe(omitted.read);
    expect(withNull.read.startsWith("In ")).toBe(false);
  });
});

describe("buildClustersVerdict", () => {
  it("says so when no clusters were found", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe('No clusters were found for "office coffee".');
  });

  it("calls it bad when even the strongest cluster has too little demand", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Vending machine costs",
          keywordCount: 3,
          totalVolume: 40,
          averageDifficulty: 20,
        },
        {
          name: "Office coffee delivery",
          keywordCount: 2,
          totalVolume: 10,
          averageDifficulty: 15,
        },
      ],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      'None of the 2 clusters found for "office coffee" have much search demand -- the strongest, "Vending machine costs", totals only 40 searches/mo across 3 keywords.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Try a broader seed topic than "office coffee"',
        evidence:
          'Best cluster found ("Vending machine costs") totals only 40 searches/mo',
        weight: 50,
      },
    ]);
  });

  it("calls the volume boundary worth trying right at 100 searches/mo", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Office coffee subscription",
          keywordCount: 6,
          totalVolume: 100,
          averageDifficulty: null,
        },
      ],
    });

    expect(verdict.tone).not.toBe("bad");
  });

  it("calls it mixed when the strongest cluster is hard to rank for", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Enterprise coffee contracts",
          keywordCount: 8,
          totalVolume: 500,
          averageDifficulty: 75,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      '"Enterprise coffee contracts" is the strongest gap found for "office coffee" -- 8 keywords totaling 500 searches/mo, but at an average difficulty of 75, it won\'t be an easy hub to rank.',
    );
    expect(verdict.actions).toEqual([
      {
        label:
          'Build a hub page around "Enterprise coffee contracts", starting with its easier keywords',
        evidence: "Average difficulty 75 across 8 keywords",
        weight: 70,
      },
    ]);
  });

  it("calls the difficulty boundary mixed right at KD 70", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Enterprise coffee contracts",
          keywordCount: 8,
          totalVolume: 500,
          averageDifficulty: 70,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("calls it good just below the difficulty boundary (KD 69)", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Enterprise coffee contracts",
          keywordCount: 8,
          totalVolume: 500,
          averageDifficulty: 69,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
  });

  it("calls it good and names the hub target when demand and difficulty both check out", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Office coffee subscription",
          keywordCount: 6,
          totalVolume: 500,
          averageDifficulty: 30,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      '"Office coffee subscription" is the strongest gap worth a hub page -- 6 keywords totaling 500 searches/mo at an average difficulty of 30.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Build a hub page around "Office coffee subscription"',
        evidence: "6 keywords, 500 searches/mo, average difficulty 30",
        weight: 100,
      },
    ]);
  });

  it("still calls it good without inventing a difficulty figure when none is known", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Office coffee subscription",
          keywordCount: 6,
          totalVolume: 200,
          averageDifficulty: null,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      '"Office coffee subscription" is the strongest gap worth a hub page -- 6 keywords totaling 200 searches/mo.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Build a hub page around "Office coffee subscription"',
        evidence: "6 keywords, 200 searches/mo",
        weight: 100,
      },
    ]);
  });
});
