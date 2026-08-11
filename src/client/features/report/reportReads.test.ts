import { describe, expect, it } from "vitest";
import { describeFailedReads, describeSnapshotGap } from "./reportReads";

describe("describeFailedReads", () => {
  it("says nothing when the named reads did not fail", () => {
    expect(
      describeFailedReads({ gsc: false, audits: true }, ["gsc"]),
    ).toBeNull();
    expect(describeFailedReads({}, ["gsc", "topPages"])).toBeNull();
  });

  it("names the failed read and calls it a failure, not an empty result", () => {
    const reason = describeFailedReads({ audits: true }, ["audits"]);
    expect(reason).toContain("site audit history");
    expect(reason).toContain("could not be read");
    expect(reason).toContain("rather than returning nothing");
  });

  it("ignores failures the caller did not ask about", () => {
    // Each chapter names only its own sources, so an unrelated outage cannot
    // print a reason next to a chapter it had nothing to do with.
    expect(describeFailedReads({ onPage: true }, ["gsc"])).toBeNull();
  });

  it("joins several failures into one sentence with plural agreement", () => {
    const reason = describeFailedReads({ gsc: true, insights: true }, [
      "gsc",
      "insights",
    ]);
    expect(reason).toContain(
      "Search Console data and the internal link analysis",
    );
    expect(reason).toContain("those requests");
  });

  it("starts the sentence with a capital whatever the subject is", () => {
    // Subjects are stored lower-case so they can be joined mid-sentence.
    expect(describeFailedReads({ insights: true }, ["insights"])).toMatch(
      /^The internal link analysis/,
    );
  });
});

describe("describeSnapshotGap", () => {
  const base = {
    subject: "the saved backlink analysis",
    isError: false,
    restoring: false,
    outcome: "none" as const,
    otherDomain: false,
  };

  it("returns null for the ordinary never-run case", () => {
    // The caller owns that wording, so it can name the analysis to run.
    expect(describeSnapshotGap(base)).toBeNull();
    expect(describeSnapshotGap({ ...base, outcome: "ready" })).toBeNull();
    expect(describeSnapshotGap({ ...base, outcome: null })).toBeNull();
  });

  it("distinguishes an expired payload from a run that never happened", () => {
    const reason = describeSnapshotGap({ ...base, outcome: "expired" });
    expect(reason).toContain("expired");
    expect(reason).not.toContain("has been saved");
  });

  it("distinguishes a stored shape it can no longer parse", () => {
    expect(describeSnapshotGap({ ...base, outcome: "unreadable" })).toContain(
      "format this report can no longer read",
    );
  });

  it("says a restore failed rather than reporting an absence", () => {
    const reason = describeSnapshotGap({
      ...base,
      isError: true,
      outcome: null,
    });
    expect(reason).toContain("rather than returning nothing");
  });

  it("prefers the failure over every softer explanation", () => {
    // A failed restore can also look expired-ish to the outcome memo; the
    // request throwing is the fact worth printing.
    expect(
      describeSnapshotGap({
        ...base,
        isError: true,
        restoring: true,
        outcome: "expired",
        otherDomain: true,
      }),
    ).toContain("that request failed");
  });

  it("does not call an in-flight restore missing", () => {
    // This page can be printed mid-load.
    expect(
      describeSnapshotGap({ ...base, restoring: true, outcome: null }),
    ).toContain("still loading");
  });

  it("explains a snapshot that covers another domain", () => {
    const reason = describeSnapshotGap({
      ...base,
      outcome: "ready",
      otherDomain: true,
    });
    expect(reason).toContain("different domain");
  });
});
