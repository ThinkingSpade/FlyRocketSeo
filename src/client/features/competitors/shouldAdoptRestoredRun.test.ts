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

  it("adopts a run when the target still has the scheme and www. the stored label was normalized away", () => {
    // The exact failure scenario: the label was recorded via
    // normalizeDomainInput (strips scheme/www./path), but `target` here is
    // raw, un-normalized form input.
    expect(
      shouldAdoptRestoredRun({
        target: "https://www.americavending.com/",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("adopts a run when the target carries a path the stored label never had", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "americavending.com/vending-machines",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("adopts a run when only www. differs, with no scheme on either side", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "www.americavending.com",
        restoredLabel: "americavending.com",
      }),
    ).toBe(true);
  });

  it("still refuses a different domain once both sides are normalized the same way", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "https://www.deliotx.com/",
        restoredLabel: "americavending.com",
      }),
    ).toBe(false);
  });

  it("refuses rather than throws when the target cannot be parsed as a domain", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "not a domain at all",
        restoredLabel: "americavending.com",
      }),
    ).toBe(false);
  });

  it("refuses rather than throws when the stored label cannot be parsed as a domain", () => {
    expect(
      shouldAdoptRestoredRun({
        target: "americavending.com",
        restoredLabel: "not a domain at all",
      }),
    ).toBe(false);
  });
});
