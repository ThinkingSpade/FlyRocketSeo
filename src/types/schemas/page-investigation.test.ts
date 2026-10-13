import { describe, expect, it } from "vitest";
import { pageInvestigationInputSchema } from "./page-investigation";
const base = { projectId: "p", url: "https://example.com/" };
describe("investigation window validation", () => {
  it("rejects partial, inverted, invalid and excessive date windows", () => {
    for (const dates of [
      { startDate: "2026-09-01" },
      { startDate: "2026-09-28", endDate: "2026-09-01" },
      { startDate: "2026-02-30", endDate: "2026-03-28" },
      { startDate: "2026-01-01", endDate: "2026-09-28" },
    ])
      expect(
        pageInvestigationInputSchema.safeParse({ ...base, ...dates }).success,
      ).toBe(false);
  });
  it("preserves exact URL identity and supported dimensions", () => {
    expect(
      pageInvestigationInputSchema.parse({
        ...base,
        url: "https://example.com/a?q=1",
        country: "USA",
        device: "MOBILE",
      }),
    ).toMatchObject({
      url: "https://example.com/a?q=1",
      country: "usa",
      device: "MOBILE",
      searchType: "web",
    });
  });
});
