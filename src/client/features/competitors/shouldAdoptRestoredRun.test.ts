import { describe, expect, it } from "vitest";
import { shouldAdoptRestoredRun } from "./shouldAdoptRestoredRun";

describe("shouldAdoptRestoredRun", () => {
  it("adopts the last run when no target is set yet", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("adopts a run for the target currently being viewed", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "AmericaVending.com",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("refuses a run belonging to a different client's domain", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "deliotx.com",
        restoredLabel: "americavending.com",
      }),
    ).toBe(false);
  });

  it("is false when there is nothing restored", () => {
    expect(
      shouldAdoptRestoredRun({ target: "deliotx.com", restoredLabel: null }),
    ).toBe(false);
  });
});
