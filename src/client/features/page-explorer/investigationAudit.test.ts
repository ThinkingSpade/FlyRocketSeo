import { describe, expect, it } from "vitest";
import { selectInvestigationAudit } from "./investigationAudit";

describe("stored page evidence scope", () => {
  it("ignores a completed crawl from the project's previous website", () => {
    expect(
      selectInvestigationAudit(
        [
          { id: "old", status: "completed", startUrl: "https://old.example/" },
          { id: "failed", status: "failed", startUrl: "https://example.com/" },
          {
            id: "current",
            status: "completed",
            startUrl: "https://example.com/",
          },
        ],
        "https://example.com/page?q=one",
      )?.id,
    ).toBe("current");
  });
  it("keeps missing, invalid and unrelated evidence unavailable", () => {
    expect(
      selectInvestigationAudit(
        [{ id: "bad", status: "completed", startUrl: "invalid" }],
        "https://example.com/",
      ),
    ).toBeUndefined();
    expect(
      selectInvestigationAudit([], "https://example.com/"),
    ).toBeUndefined();
  });
});
