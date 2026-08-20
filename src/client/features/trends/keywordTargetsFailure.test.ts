import { describe, expect, it } from "vitest";
import { describePaidFailure } from "./keywordTargetsState";

/**
 * The wording of a paid-run failure, split from `keywordTargetsState.test.ts`
 * when that file reached the 400-line ceiling. These cases are about one
 * function and share none of that file's fixtures, so they travel together.
 *
 * What they protect: this banner renders directly above the free Search
 * Console table, so every sentence here is read as a caption for whatever
 * numbers are on screen beneath it.
 */

describe("describePaidFailure", () => {
  it("names credits as the cause and offers no retry that cannot succeed", () => {
    const failure = describePaidFailure({
      reason: "insufficient_credits",
      domain: "example.com",
      hasFreeRows: false,
    });
    expect(failure.canRetry).toBe(false);
    expect(failure.message).toContain("credits");
    expect(failure.message).toContain("example.com");
  });

  it("tells a rate-limited user to wait, and keeps the retry", () => {
    const failure = describePaidFailure({
      reason: "rate_limited",
      domain: "example.com",
      hasFreeRows: false,
    });
    expect(failure.canRetry).toBe(true);
    expect(failure.message).toContain("rate-limited");
  });

  it("falls back to the generic message, with a retry, for provider errors", () => {
    expect(
      describePaidFailure({
        reason: "provider_error",
        domain: "example.com",
        hasFreeRows: false,
      }),
    ).toEqual({
      message: "Couldn’t load ranking data for example.com.",
      canRetry: true,
    });
  });

  it("keeps the retry for a tag it does not recognise", () => {
    // `reason` is a persisted storage format the server can extend. An
    // unknown tag must degrade to what we said before this function existed,
    // never to silence or to a suppressed way out.
    expect(
      describePaidFailure({
        reason: "quota_exhausted",
        domain: "example.com",
        hasFreeRows: false,
      }).canRetry,
    ).toBe(true);
  });

  it("keeps the retry when no failure row could be read at all", () => {
    expect(
      describePaidFailure({
        reason: null,
        domain: "your site",
        hasFreeRows: false,
      }),
    ).toEqual({
      message: "Couldn’t load ranking data for your site.",
      canRetry: true,
    });
  });
  it("says where the rows below came from, but only when they are there", () => {
    // The banner sits directly above the table. Without this, a client reads
    // "couldn't load ranking data" as the caption for a Rank column showing 54
    // and 81 -- numbers that came from the free half. Only the credits branch
    // said so. The inverse matters too: the free half needs Search Console
    // connected, so an empty table is a real state and the sentence would then
    // describe rows nobody can see.
    for (const reason of [
      "insufficient_credits",
      "rate_limited",
      "provider_error",
      null,
    ]) {
      const withRows = describePaidFailure({
        reason,
        domain: "example.com",
        hasFreeRows: true,
      });
      const without = describePaidFailure({
        reason,
        domain: "example.com",
        hasFreeRows: false,
      });

      expect(withRows.message).toContain("come from Search Console");
      expect(without.message).not.toContain("Search Console");
    }
  });
});
