import { describe, expect, it } from "vitest";
import {
  buildTechnicalIssues,
  summarizeTechnicalIssues,
} from "./technicalIssues";
import { getTechnicalAuditState } from "./technicalAuditState";
import { isSourceUnavailable, quickWinClicks } from "./opportunityModel";

const ok = { isError: false, isPending: false };
const pending = { isError: false, isPending: true };
const failed = { isError: true, isPending: false };

function page(
  overrides: Partial<
    Parameters<typeof summarizeTechnicalIssues>[0][number]
  > = {},
) {
  return {
    url: "https://fixture.invalid/page",
    statusCode: 200,
    title: "A title",
    metaDescription: "A description",
    h1Count: 1,
    wordCount: 900,
    imagesMissingAlt: 0,
    ...overrides,
  };
}

describe("technical audit availability", () => {
  it("checks the prerequisite before a disabled query's pending state", () => {
    expect(getTechnicalAuditState(ok, pending, undefined, undefined)).toBe(
      "not-run",
    );
  });

  it("distinguishes loading history from a completed empty history", () => {
    expect(getTechnicalAuditState(pending, pending, undefined, undefined)).toBe(
      "loading",
    );
    expect(getTechnicalAuditState(ok, pending, undefined, undefined)).toBe(
      "not-run",
    );
  });

  it("does not infer zero findings from no stored pages or an absent result", () => {
    expect(getTechnicalAuditState(ok, ok, "audit", [])).toBe("empty");
    expect(getTechnicalAuditState(ok, ok, "audit", undefined)).toBe(
      "unavailable",
    );
  });

  it("keeps failures unavailable even when stale page evidence exists", () => {
    expect(getTechnicalAuditState(failed, ok, "audit", [page()])).toBe(
      "unavailable",
    );
    expect(getTechnicalAuditState(ok, failed, "audit", [page()])).toBe(
      "unavailable",
    );
  });

  it("recognizes loaded evidence and pending dependent results", () => {
    expect(getTechnicalAuditState(ok, ok, "audit", [page()])).toBe("ready");
    expect(getTechnicalAuditState(ok, pending, "audit", undefined)).toBe(
      "loading",
    );
  });
});

describe("technical evidence integrity", () => {
  it("counts each affected URL once across multiple categories", () => {
    const summary = summarizeTechnicalIssues([
      page({ title: "", metaDescription: "", h1Count: 0 }),
    ]);
    expect(summary.issues).toHaveLength(3);
    expect(summary.affectedPages).toBe(1);
  });

  it("counts all affected URLs even when examples are capped", () => {
    const summary = summarizeTechnicalIssues(
      Array.from({ length: 7 }, (_, index) =>
        page({
          url: `https://fixture.invalid/${index}`,
          title: "",
          metaDescription: "",
        }),
      ),
    );
    expect(summary.affectedPages).toBe(7);
    expect(summary.issues[0].examples).toHaveLength(3);
  });

  it("deduplicates stored URLs without merging different query strings", () => {
    const first = page({ title: "", url: "https://fixture.invalid/?id=1" });
    const second = page({ title: "", url: "https://fixture.invalid/?id=2" });
    const summary = summarizeTechnicalIssues([first, first, second]);
    expect(summary.affectedPages).toBe(2);
    expect(summary.issues[0].pageCount).toBe(2);
  });

  it("does not diagnose failed or unknown fetches as metadata problems", () => {
    const missing = { title: null, metaDescription: null, h1Count: 0 };
    expect(
      buildTechnicalIssues([page({ ...missing, statusCode: 404 })]).map(
        (issue) => issue.key,
      ),
    ).toEqual(["status"]);
    expect(
      buildTechnicalIssues([page({ ...missing, statusCode: null })]).map(
        (issue) => issue.key,
      ),
    ).toEqual(["unverified"]);
    expect(
      buildTechnicalIssues([page({ ...missing, statusCode: 301 })]).map(
        (issue) => issue.key,
      ),
    ).toEqual(["redirect"]);
  });

  it("does not treat fractional status codes as valid HTTP failures", () => {
    expect(
      buildTechnicalIssues([page({ statusCode: 404.5 })]).map(
        (issue) => issue.key,
      ),
    ).toEqual(["unverified"]);
  });

  it("preserves a genuine zero for a successfully evaluated page", () => {
    expect(summarizeTechnicalIssues([page()])).toEqual({
      issues: [],
      affectedPages: 0,
    });
  });
});

describe("opportunity input integrity", () => {
  it("does not present an absent GSC result as connected evidence", () => {
    expect(isSourceUnavailable(ok, undefined)).toBe(true);
    expect(isSourceUnavailable(ok, { connected: true })).toBe(false);
  });

  it("rejects non-finite impressions and invalid positions", () => {
    expect(quickWinClicks(Infinity, 8)).toBe(0);
    expect(quickWinClicks(1000, NaN)).toBe(0);
    expect(quickWinClicks(1000, 0)).toBe(0);
    expect(quickWinClicks(1000, 8)).toBe(80);
  });
});
