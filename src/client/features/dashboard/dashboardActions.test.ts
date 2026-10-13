import { describe, expect, it } from "vitest";
import { buildDashboardActions } from "./dashboardActions";
describe("dashboard priorities", () => {
  it("prioritizes a captured HTTP failure and retains its exact affected page", () => {
    expect(
      buildDashboardActions(
        "example.com",
        [{ url: "https://example.com/page?q=one", statusCode: 503 }],
        [
          {
            kind: "quick-win",
            query: "repair",
            page: "https://example.com/repair",
            position: 8,
            impressions: 500,
            clicksAtStake: 20,
          },
        ],
      ).map((row) => row.url),
    ).toEqual(["https://example.com/page?q=one", "https://example.com/repair"]);
  });
  it("never includes another target, unknown fetches or duplicate affected actions", () => {
    expect(
      buildDashboardActions(
        "example.com",
        [
          { url: "https://old.example/a", statusCode: 503 },
          { url: "https://example.com/b", statusCode: null },
          { url: "https://example.com/c", statusCode: 404 },
          { url: "https://example.com/c", statusCode: 404 },
        ],
        [],
      ),
    ).toHaveLength(1);
  });
});
