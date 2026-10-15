import { describe, expect, it } from "vitest";
import { harvestReadiness } from "@/server/features/expired-domains/harvestReadiness";
import { AUTO_DRAFT_RETRY_MS } from "@/server/features/profiles/autoDraftPolicy";

const NOW = Date.parse("2026-10-15T09:00:00.000Z");

function profile(
  overrides: Partial<{
    offer: string;
    customer: string;
    exclusions: string;
    brandTerms: string;
    source: "ai" | "manual";
    confirmedAt: string | null;
    draftedAt: string | null;
  }> = {},
) {
  return {
    offer: "",
    customer: "",
    exclusions: "",
    brandTerms: "",
    source: "ai" as const,
    confirmedAt: null,
    draftedAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

describe("harvestReadiness", () => {
  it("is ready from tracked keywords alone", () => {
    expect(
      harvestReadiness({
        keywords: ["office coffee service dallas"],
        profile: null,
        nowMs: NOW,
      }),
    ).toEqual({ kind: "ready", seedTermCount: 3 });
  });

  it("is ready from the profile offer, even an unconfirmed draft", () => {
    const result = harvestReadiness({
      keywords: [],
      profile: profile({ offer: "Vending and micromarkets" }),
      nowMs: NOW,
    });
    expect(result.kind).toBe("ready");
  });

  it("asks for a draft when the project has no profile at all", () => {
    expect(
      harvestReadiness({ keywords: [], profile: null, nowMs: NOW }).kind,
    ).toBe("draft-due");
  });

  it("waits out the retry window after an empty draft", () => {
    // The production state on 2026-10-15: every auto-draft had claimed its
    // row and left it empty, and nothing ever tried again.
    expect(
      harvestReadiness({ keywords: [], profile: profile(), nowMs: NOW }).kind,
    ).toBe("draft-waiting");
  });

  it("retries an empty draft once the window has passed", () => {
    const stale = profile({
      draftedAt: new Date(NOW - AUTO_DRAFT_RETRY_MS - 1).toISOString(),
    });
    expect(
      harvestReadiness({ keywords: [], profile: stale, nowMs: NOW }).kind,
    ).toBe("draft-due");
  });

  it("never redrafts a profile a person saved, even an empty one", () => {
    const saved = profile({
      source: "manual",
      confirmedAt: new Date(NOW).toISOString(),
      draftedAt: null,
    });
    expect(
      harvestReadiness({ keywords: [], profile: saved, nowMs: NOW }).kind,
    ).toBe("needs-input");
  });

  it("does not count filler-only words as vocabulary", () => {
    expect(
      harvestReadiness({
        keywords: ["best company near me"],
        profile: null,
        nowMs: NOW,
      }).kind,
    ).toBe("draft-due");
  });

  it("treats an AI row with no timestamp as due, as the reclaim UPDATE does", () => {
    expect(
      harvestReadiness({
        keywords: [],
        profile: profile({ draftedAt: null }),
        nowMs: NOW,
      }).kind,
    ).toBe("draft-due");
  });

  it("leaves a whitespace-only draft to a person, since the reclaim cannot match it", () => {
    // The reclaim matches literal empty strings. Calling this "due" would let
    // the cron pick a project every tick that the reclaim then refuses.
    expect(
      harvestReadiness({
        keywords: [],
        profile: profile({
          offer: " ",
          draftedAt: new Date(NOW - AUTO_DRAFT_RETRY_MS - 1).toISOString(),
        }),
        nowMs: NOW,
      }).kind,
    ).toBe("needs-input");
  });
});
