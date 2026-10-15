import { describe, expect, it } from "vitest";
import {
  MAX_KEYWORD_SESSION_RUNS,
  findSessionRun,
  restoredRunAnswers,
  recordSessionRun,
  type KeywordSessionRun,
} from "./keywordSessionRuns";

const US = 2840;

function run(
  keyword: string,
  nonce: number,
  overrides: Partial<KeywordSessionRun<string>["values"]> = {},
): KeywordSessionRun<string> {
  return {
    values: {
      keyword,
      locationCode: US,
      resultLimit: 150,
      mode: "auto",
      clickstream: false,
      ...overrides,
    },
    geo: `geo-${nonce}`,
    nonce,
  };
}

const scope = (keyword: string) => ({
  keyword,
  locationCode: US,
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
});

describe("findSessionRun", () => {
  it("answers nothing when the URL names no search (Recent searches)", () => {
    const runs = [run("seo", 1)];
    expect(findSessionRun(runs, null)).toBeNull();
    expect(findSessionRun(runs, scope("  "))).toBeNull();
  });

  it("finds the run behind the tab the URL names, not the latest run", () => {
    const runs = [run("keyword research", 1), run("backlinks", 2)];
    expect(findSessionRun(runs, scope("keyword research"))?.nonce).toBe(1);
    expect(findSessionRun(runs, scope("backlinks"))?.nonce).toBe(2);
  });

  it("answers nothing for a tab that was never run this session", () => {
    expect(findSessionRun([run("backlinks", 1)], scope("ai seo"))).toBeNull();
  });

  it("does not hand a run to a search with different settings", () => {
    const runs = [run("seo", 1)];
    expect(
      findSessionRun(runs, { ...scope("seo"), locationCode: 2826 }),
    ).toBeNull();
    expect(
      findSessionRun(runs, { ...scope("seo"), resultLimit: 300 }),
    ).toBeNull();
    expect(findSessionRun(runs, { ...scope("seo"), mode: "ideas" })).toBeNull();
    expect(
      findSessionRun(runs, { ...scope("seo"), clickstream: true }),
    ).toBeNull();
  });

  it("lets one multi-keyword submission answer each of its seed tabs", () => {
    const runs = [run("ai seo\nbacklinks, open seo", 1)];
    expect(findSessionRun(runs, scope("ai seo"))?.nonce).toBe(1);
    expect(findSessionRun(runs, scope("open seo"))?.nonce).toBe(1);
    expect(findSessionRun(runs, scope("seo"))).toBeNull();
  });

  it("prefers the newest run when two cover the same tab", () => {
    const runs = [run("seo", 1), run("seo\ntools", 2)];
    expect(findSessionRun(runs, scope("seo"))?.nonce).toBe(2);
  });
});

describe("recordSessionRun", () => {
  it("keeps a bounded list, dropping the oldest runs first", () => {
    let runs: KeywordSessionRun<string>[] = [];
    for (let nonce = 1; nonce <= MAX_KEYWORD_SESSION_RUNS + 3; nonce += 1) {
      runs = recordSessionRun(runs, run(`k${nonce}`, nonce));
    }
    expect(runs).toHaveLength(MAX_KEYWORD_SESSION_RUNS);
    expect(runs[0]?.nonce).toBe(4);
    expect(runs.at(-1)?.nonce).toBe(MAX_KEYWORD_SESSION_RUNS + 3);
  });
});

describe("restoredRunAnswers", () => {
  it("lets any stored run fill the view when the URL names no search", () => {
    expect(restoredRunAnswers("", "backlinks")).toBe(true);
  });

  it("only lets a stored run stand in for the search the URL names", () => {
    expect(restoredRunAnswers("backlinks", "backlinks")).toBe(true);
    // Stored labels join a multi-keyword run's seeds with ", ".
    expect(restoredRunAnswers("open seo", "ai seo, open seo")).toBe(true);
    expect(restoredRunAnswers("ai seo", "backlinks")).toBe(false);
  });
});
