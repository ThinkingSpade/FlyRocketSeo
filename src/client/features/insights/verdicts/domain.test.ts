import { describe, expect, it } from "vitest";
import { buildDomainVerdict } from "./domain";

describe("buildDomainVerdict", () => {
  it("says so when there is no organic data at all", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: null,
      organicTraffic: null,
      positionBuckets: null,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "No organic traffic or keyword data is available for example.com, so there is nothing to judge where its traffic concentrates.",
    );
  });

  it("says so when totals are known but there is no position breakdown", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 500,
      organicTraffic: 1200,
      positionBuckets: null,
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "Organic totals are known for example.com, but no ranking-position breakdown is available, so there is no way to see where its traffic concentrates.",
    );
  });

  it("declines to call it when no keyword has a known ranking position", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 40,
      organicTraffic: 100,
      positionBuckets: {
        top3: 0,
        pos4to10: 0,
        pos11to20: 0,
        pos21to50: 0,
        pos51plus: 0,
      },
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "None of example.com's organic keywords have a known ranking position, so there is nothing to measure where its traffic concentrates.",
    );
  });

  it("declines to call it below the evidence floor (9 tracked keywords)", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 40,
      organicTraffic: 100,
      positionBuckets: {
        top3: 2,
        pos4to10: 3,
        pos11to20: 2,
        pos21to50: 1,
        pos51plus: 1,
      },
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      "Only 9 of example.com's organic keywords have a known ranking position -- too few to say anything meaningful about where its traffic concentrates.",
    );
  });

  it("calls a verdict right at the evidence floor (10 tracked keywords)", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 40,
      organicTraffic: 100,
      positionBuckets: {
        top3: 1,
        pos4to10: 1,
        pos11to20: 3,
        pos21to50: 2,
        pos51plus: 3,
      },
    });

    expect(verdict.tone).not.toBe("unknown");
  });

  it("calls it good when a broad share of keywords reach page one", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 100,
      organicTraffic: 5000,
      positionBuckets: {
        top3: 20,
        pos4to10: 15,
        pos11to20: 10,
        pos21to50: 25,
        pos51plus: 30,
      },
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe(
      // Reports ranking breadth only. Keyword counts per position band cannot
      // establish traffic concentration -- 35% on page one is compatible with
      // one keyword carrying nearly all the traffic.
      "35 keywords of example.com's 100 ranked keywords (35%) reach page one -- a broad ranking base. Which of them actually carry the traffic needs the per-keyword breakdown.",
    );
  });

  it("calls the broad-base boundary good right at 30% page-one share", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 100,
      organicTraffic: 5000,
      positionBuckets: {
        top3: 10,
        pos4to10: 20,
        pos11to20: 20,
        pos21to50: 20,
        pos51plus: 30,
      },
    });

    expect(verdict.tone).toBe("good");
  });

  it("calls it mixed just below the broad-base boundary (29%)", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 100,
      organicTraffic: 5000,
      positionBuckets: {
        top3: 9,
        pos4to10: 20,
        pos11to20: 21,
        pos21to50: 20,
        pos51plus: 30,
      },
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("calls it mixed right at the fragile-share boundary (10%)", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 100,
      organicTraffic: 5000,
      positionBuckets: {
        top3: 2,
        pos4to10: 8,
        pos11to20: 20,
        pos21to50: 30,
        pos51plus: 40,
      },
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      "10 keywords of example.com's 100 ranked keywords (10%) reach page one -- a moderate base, not yet wide enough to call this domain's traffic resilient to losing any one ranking.",
    );
    expect(verdict.actions).toEqual([
      {
        label: "Push the 20 keywords ranking #11-20 toward page one",
        evidence: "20 keywords already rank just one band below page one",
        weight: 60,
      },
    ]);
  });

  it("calls it bad just below the fragile-share boundary (9%) and names what's at risk", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 100,
      organicTraffic: 5000,
      positionBuckets: {
        top3: 1,
        pos4to10: 1,
        pos11to20: 3,
        pos21to50: 45,
        pos51plus: 50,
      },
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      "2 keywords of example.com's 100 ranked keywords (2%) reach page one -- whatever traffic this domain earns concentrates in that thin slice, with the rest of its 100 ranked keywords unlikely to be contributing much.",
    );
    expect(verdict.actions).toEqual([
      {
        label: "Protect the 1 keyword ranking #1-3",
        evidence: "Only 2% of 100 ranked keywords reach page one at all",
        weight: 100,
      },
      {
        label: "Push the 3 keywords ranking #11-20 toward page one",
        evidence: "3 keywords already rank just one band below page one",
        weight: 70,
      },
    ]);
  });

  it("says 'none' rather than '0 keywords' when literally no keyword reaches page one", () => {
    const verdict = buildDomainVerdict({
      domain: "example.com",
      organicKeywords: 100,
      organicTraffic: 5000,
      positionBuckets: {
        top3: 0,
        pos4to10: 0,
        pos11to20: 10,
        pos21to50: 40,
        pos51plus: 50,
      },
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toContain("None of example.com's 100 ranked keywords");
    expect(verdict.actions).toEqual([
      {
        label: "Push the 10 keywords ranking #11-20 toward page one",
        evidence: "10 keywords already rank just one band below page one",
        weight: 100,
      },
    ]);
  });
});
