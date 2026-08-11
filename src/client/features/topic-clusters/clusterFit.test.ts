import { describe, expect, it } from "vitest";

import { summariseClusterFit } from "./clusterFit";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";

const fit = new Map<string, FitResult>([
  ["vending machines for sale", { verdict: "wrong-customer", reason: "sale" }],
  ["buy a vending machine", { verdict: "wrong-customer", reason: "sale" }],
  ["office coffee service dallas", { verdict: "on-offer", reason: "" }],
  ["break room snacks", { verdict: "adjacent", reason: "" }],
]);

/**
 * A cluster plan is a commitment to write articles. Sending someone off to
 * write two of eight pieces for a customer their client does not have is the
 * exact failure the business profile exists to prevent -- and it costs more
 * here than on a keyword table, because the output is a content plan someone
 * acts on rather than a row they skim.
 */
describe("summariseClusterFit", () => {
  it("counts how many keywords belong to someone else's customer", () => {
    const summary = summariseClusterFit(
      [
        "vending machines for sale",
        "buy a vending machine",
        "office coffee service dallas",
      ],
      fit,
    );
    expect(summary).toEqual({ wrongCustomer: 2, total: 3 });
  });

  it("does not count adjacent keywords as wrong", () => {
    // "adjacent" means plausibly theirs, just not the core offer. Demoting it
    // the same way as wrong-customer would throw away real topics.
    const summary = summariseClusterFit(["break room snacks"], fit);
    expect(summary.wrongCustomer).toBe(0);
  });

  it("reports nothing when the profile produced no verdicts at all", () => {
    // An empty map is what useKeywordFit returns for an unusable or
    // unconfirmed profile. That must read as "not checked", never as
    // "checked and all fine".
    const summary = summariseClusterFit(
      ["vending machines for sale"],
      new Map(),
    );
    expect(summary).toEqual({ wrongCustomer: 0, total: 1 });
  });

  it("ignores keywords the classifier had no opinion on", () => {
    const summary = summariseClusterFit(["never seen before"], fit);
    expect(summary.wrongCustomer).toBe(0);
  });
});
