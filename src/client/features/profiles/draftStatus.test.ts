import { describe, expect, it } from "vitest";

import {
  DRAFT_BUSY_MESSAGE,
  DRAFT_IDLE_MESSAGE,
  resolveDraftStatus,
} from "./draftStatus";

/**
 * The reported bug was "clicking the button does nothing at all".
 *
 * The button was wired correctly the whole time -- verified in the deployed
 * production chunk -- and the server path works end to end. What was missing
 * was any way to SEE the outcome: the failure message replaced the neutral
 * hint in the same position, at the same size, in the same
 * `text-base-content/60` grey. One grey sentence became another grey
 * sentence, which is indistinguishable from nothing at a glance.
 *
 * So the distinction that matters is not the message text, it is the TONE,
 * and it is resolved here rather than inline in the card so it can be
 * asserted without rendering (this repo's test environment is `node`; there
 * is no jsdom and no component rendering anywhere in it).
 */
describe("resolveDraftStatus", () => {
  it("is idle before anything is clicked", () => {
    const status = resolveDraftStatus({
      isPending: false,
      isError: false,
      error: null,
    });
    expect(status.tone).toBe("idle");
    expect(status.message).toBe(DRAFT_IDLE_MESSAGE);
  });

  it("says how long it takes while running, because it really does take that long", () => {
    // Measured: 16.1s against a real domain locally, and production pays a
    // fresh isolate on top of that. A spinner with no duration reads as hung.
    const status = resolveDraftStatus({
      isPending: true,
      isError: false,
      error: null,
    });
    expect(status.tone).toBe("busy");
    expect(status.message).toBe(DRAFT_BUSY_MESSAGE);
  });

  it("carries an error tone, so the failure cannot be styled as a hint", () => {
    const status = resolveDraftStatus({
      isPending: false,
      isError: true,
      error: new Error("PROFILE_SITE_UNREADABLE"),
    });
    expect(status.tone).toBe("error");
  });

  it("translates a bare error code into a sentence a user can act on", () => {
    // Server function errors arrive as their CODE and nothing else -- the
    // message passed to AppError never crosses the boundary.
    const status = resolveDraftStatus({
      isPending: false,
      isError: true,
      error: new Error("INTERNAL_ERROR"),
    });
    expect(status.message).toBe(
      "An unexpected error occurred. Please check server logs and try again.",
    );
  });

  it("falls back to a drafting-specific sentence when the error carries nothing", () => {
    const status = resolveDraftStatus({
      isPending: false,
      isError: true,
      error: undefined,
    });
    expect(status.tone).toBe("error");
    expect(status.message).toBe("Couldn't draft from the site.");
  });

  it("prefers the running state over a previous failure", () => {
    // Retrying after a failure must not show the old error next to a button
    // that is currently working.
    const status = resolveDraftStatus({
      isPending: true,
      isError: true,
      error: new Error("INTERNAL_ERROR"),
    });
    expect(status.tone).toBe("busy");
  });
});
