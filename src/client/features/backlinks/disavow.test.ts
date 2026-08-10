import { describe, expect, it } from "vitest";
import {
  auditToxicDomains,
  buildDisavowFile,
  buildDisavowFilename,
  normalizeDisavowDomain,
  type ToxicCandidateRow,
} from "./disavow";

function row(
  domain: string | null,
  spamScore: number | null,
  backlinks: number | null = 1,
  rank: number | null = 40,
): ToxicCandidateRow {
  return { domain, spamScore, backlinks, rank };
}

describe("normalizeDisavowDomain", () => {
  it("strips scheme, www, path and port", () => {
    expect(
      normalizeDisavowDomain("https://www.spam.example.com:8080/a/b"),
    ).toBe("spam.example.com");
  });

  it("rejects values that are not hosts", () => {
    expect(normalizeDisavowDomain("localhost")).toBeNull();
    expect(normalizeDisavowDomain("")).toBeNull();
    expect(normalizeDisavowDomain(null)).toBeNull();
  });
});

describe("auditToxicDomains", () => {
  it("keeps only rows at or above the threshold", () => {
    const audit = auditToxicDomains([
      row("clean.com", 10),
      row("borderline.com", 60),
      row("bad.com", 90),
    ]);
    expect(audit.candidates.map((c) => c.domain)).toEqual([
      "bad.com",
      "borderline.com",
    ]);
  });

  it("uses the shared high-risk boundary", () => {
    const audit = auditToxicDomains([
      row("review.com", 59),
      row("high-risk.com", 60),
    ]);
    expect(audit.candidates.map((candidate) => candidate.domain)).toEqual([
      "high-risk.com",
    ]);
  });

  it("ignores rows with no spam score rather than assuming zero", () => {
    const audit = auditToxicDomains([row("unknown.com", null)]);
    expect(audit.scored).toBe(0);
    expect(audit.candidates).toHaveLength(0);
  });

  it("sorts worst first, then by links at stake", () => {
    const audit = auditToxicDomains([
      row("a.com", 70, 5),
      row("b.com", 90, 1),
      row("c.com", 70, 50),
    ]);
    expect(audit.candidates.map((c) => c.domain)).toEqual([
      "b.com",
      "c.com",
      "a.com",
    ]);
  });

  it("totals the backlinks at stake", () => {
    const audit = auditToxicDomains([
      row("a.com", 70, 5),
      row("b.com", 90, 12),
    ]);
    expect(audit.affectedBacklinks).toBe(17);
  });

  it("drops rows whose domain cannot be normalised", () => {
    expect(auditToxicDomains([row(null, 99)]).candidates).toHaveLength(0);
  });

  it("calls out a spammy domain that also has no authority", () => {
    const audit = auditToxicDomains([row("a.com", 70, 1, 4)]);
    expect(audit.candidates[0].reason).toContain("Domain authority 4/100");
  });

  it("does not add a separate severe tier", () => {
    const audit = auditToxicDomains([row("a.com", 90)]);
    expect(audit.candidates[0].reason).toBe(
      "Spam score 90/100 · High-risk signal.",
    );
  });
});

describe("buildDisavowFile", () => {
  const generatedAt = new Date("2026-07-29T10:00:00.000Z");

  it("emits one domain: line per candidate", () => {
    const audit = auditToxicDomains([row("bad.com", 90, 3)]);
    const file = buildDisavowFile(audit, "deliotx.com", generatedAt);
    expect(file).toContain("domain:bad.com");
    expect(
      file.split("\n").filter((l) => l.startsWith("domain:")),
    ).toHaveLength(1);
  });

  it("puts every non-domain line behind a comment marker", () => {
    const audit = auditToxicDomains([row("bad.com", 90, 3)]);
    const meaningful = buildDisavowFile(audit, "deliotx.com", generatedAt)
      .split("\n")
      .filter((candidate) => candidate.trim() !== "");
    for (const line of meaningful) {
      expect(line.startsWith("#") || line.startsWith("domain:")).toBe(true);
    }
  });

  it("names the target and the date in the header", () => {
    const file = buildDisavowFile(
      auditToxicDomains([]),
      "deliotx.com",
      generatedAt,
    );
    expect(file).toContain("deliotx.com");
    expect(file).toContain("2026-07-29");
  });

  it("stays valid with no candidates", () => {
    const file = buildDisavowFile(
      auditToxicDomains([]),
      "deliotx.com",
      generatedAt,
    );
    expect(file).not.toContain("domain:");
    expect(file.endsWith("\n")).toBe(true);
  });
});

describe("buildDisavowFilename", () => {
  it("slugs the target into the filename", () => {
    expect(buildDisavowFilename("https://deliotx.com")).toBe(
      "disavow-deliotx.com.txt",
    );
  });

  it("falls back when the target slugs to nothing", () => {
    expect(buildDisavowFilename("!!!")).toBe("disavow.txt");
  });
});
