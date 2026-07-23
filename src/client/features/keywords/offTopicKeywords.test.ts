import { describe, expect, it } from "vitest";
import { partitionByRelevance } from "./offTopicKeywords";

describe("partitionByRelevance", () => {
  it("separates drifted keywords from on-topic ones", () => {
    const rows = [
      { keyword: "delio pro" },
      { keyword: "obnoxious meaning" },
      { keyword: "delio meaning" },
      { keyword: "aria name meaning" },
    ];
    const { onTopic, offTopic } = partitionByRelevance(rows, "delio");
    expect(onTopic.map((r) => r.keyword)).toEqual([
      "delio pro",
      "delio meaning",
    ]);
    expect(offTopic.map((r) => r.keyword)).toEqual([
      "obnoxious meaning",
      "aria name meaning",
    ]);
  });

  it("keeps every row on-topic when there is no seed", () => {
    const rows = [{ keyword: "anything" }];
    expect(partitionByRelevance(rows, "").offTopic).toEqual([]);
  });

  it("preserves the incoming order within each side", () => {
    const rows = [{ keyword: "b delio" }, { keyword: "a delio" }];
    expect(
      partitionByRelevance(rows, "delio").onTopic.map((r) => r.keyword),
    ).toEqual(["b delio", "a delio"]);
  });
});
