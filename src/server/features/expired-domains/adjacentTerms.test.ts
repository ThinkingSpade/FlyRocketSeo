import { describe, expect, it } from "vitest";
import { parseAdjacentTerms } from "@/server/features/expired-domains/adjacentTerms";

describe("parseAdjacentTerms", () => {
  it("reads a plain comma list", () => {
    expect(parseAdjacentTerms("snack, nutrition, coffee")).toEqual([
      "snack",
      "nutrition",
      "coffee",
    ]);
  });

  it("reads a newline list, which models emit just as often", () => {
    expect(parseAdjacentTerms("snack\nnutrition\ncoffee")).toEqual([
      "snack",
      "nutrition",
      "coffee",
    ]);
  });

  it("strips list markers and numbering", () => {
    expect(parseAdjacentTerms("- snack\n2. nutrition\n* coffee")).toEqual([
      "snack",
      "nutrition",
      "coffee",
    ]);
  });

  // A model that decides to explain itself must not turn a sentence into a
  // domain name. Multi-word phrases and prose are dropped, not slugged.
  it("keeps single words and drops prose", () => {
    expect(
      parseAdjacentTerms(
        "Here are some adjacent industries you might consider: snack, nutrition",
      ),
    ).toEqual(["snack", "nutrition"]);
  });

  it("lowercases and dedupes", () => {
    expect(parseAdjacentTerms("Snack, snack, NUTRITION")).toEqual([
      "snack",
      "nutrition",
    ]);
  });

  it("drops anything that cannot appear in a hostname", () => {
    expect(parseAdjacentTerms("snack, café!, nutrition")).toEqual([
      "snack",
      "nutrition",
    ]);
  });

  it("returns nothing for an empty or unusable answer", () => {
    expect(parseAdjacentTerms("")).toEqual([]);
    expect(parseAdjacentTerms("I'm sorry, I can't help with that.")).toEqual(
      [],
    );
  });

  it("caps the list, since each term multiplies generated names", () => {
    const many = Array.from({ length: 60 }, (_, i) => `term${i}`).join(", ");
    expect(parseAdjacentTerms(many).length).toBeLessThanOrEqual(30);
  });
});
