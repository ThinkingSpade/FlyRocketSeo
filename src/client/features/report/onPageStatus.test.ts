import { describe, it, expect } from "vitest";
import { describeOnPageStatus } from "./onPageStatus";

describe("describeOnPageStatus", () => {
  it("reports no audit when nothing has been crawled", () => {
    expect(
      describeOnPageStatus({
        pagesCrawled: null,
        pagesAnalyzed: 0,
        issuesFound: 0,
      }),
    ).toBe("no-audit");
  });

  it("reports issues when any were found", () => {
    expect(
      describeOnPageStatus({
        pagesCrawled: 10,
        pagesAnalyzed: 10,
        issuesFound: 3,
      }),
    ).toBe("issues");
  });

  it("only calls a site clean when its pages were actually analyzed", () => {
    expect(
      describeOnPageStatus({
        pagesCrawled: 10,
        pagesAnalyzed: 10,
        issuesFound: 0,
      }),
    ).toBe("clean");
  });

  it("never claims clean when the crawl's pages could not be loaded", () => {
    // The audit says it crawled pages, but none came back — reporting "clean"
    // here would tell a client their site is healthy on missing data.
    expect(
      describeOnPageStatus({
        pagesCrawled: 10,
        pagesAnalyzed: 0,
        issuesFound: 0,
      }),
    ).toBe("unavailable");
  });

  it("treats a zero-page crawl as unavailable rather than clean", () => {
    expect(
      describeOnPageStatus({
        pagesCrawled: 0,
        pagesAnalyzed: 0,
        issuesFound: 0,
      }),
    ).toBe("unavailable");
  });
});
