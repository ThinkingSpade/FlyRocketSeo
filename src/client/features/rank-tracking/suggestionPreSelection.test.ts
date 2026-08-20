import { describe, expect, it } from "vitest";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import { pickPreSelectedSuggestions } from "./suggestionPreSelection";

const NO_FIT = new Map<string, FitResult>();

function wrongCustomer(...keywords: string[]): Map<string, FitResult> {
  return new Map(
    keywords.map((keyword) => [
      keyword,
      { verdict: "wrong-customer" as const, reason: "not your customer" },
    ]),
  );
}

describe("pickPreSelectedSuggestions", () => {
  const items = [
    { keyword: "plumber salary", traffic: 900 },
    { keyword: "emergency plumber dallas", traffic: 400 },
    { keyword: "burst pipe repair", traffic: 100 },
  ];

  it("takes the top rows by traffic when no profile rules anything out", () => {
    const result = pickPreSelectedSuggestions(items, NO_FIT, 2);
    expect(result.selection).toEqual({ "0": true, "1": true });
    expect(result.wrongFitCount).toBe(0);
  });

  it("never pre-selects a wrong-customer keyword, however much traffic it has", () => {
    const result = pickPreSelectedSuggestions(
      items,
      wrongCustomer("plumber salary"),
      2,
    );
    // The salary row is the highest-traffic row and the reason this exists:
    // pre-selecting it bills a recurring check on someone else's customer.
    expect(result.selection).toEqual({ "1": true, "2": true });
    expect(result.wrongFitCount).toBe(1);
  });

  it("selects nothing when every suggestion is off-target", () => {
    const result = pickPreSelectedSuggestions(
      items,
      wrongCustomer(...items.map((item) => item.keyword)),
      20,
    );
    expect(result.selection).toEqual({});
    expect(result.wrongFitCount).toBe(3);
  });

  it("keeps provider order when traffic ties or is missing", () => {
    const untrafficked = [
      { keyword: "a", traffic: null },
      { keyword: "b", traffic: null },
      { keyword: "c", traffic: null },
    ];
    expect(
      pickPreSelectedSuggestions(untrafficked, NO_FIT, 2).selection,
    ).toEqual({ "0": true, "1": true });
  });

  it("selects everything eligible when the limit exceeds the set", () => {
    expect(
      Object.keys(pickPreSelectedSuggestions(items, NO_FIT, 50).selection),
    ).toHaveLength(3);
  });
});
