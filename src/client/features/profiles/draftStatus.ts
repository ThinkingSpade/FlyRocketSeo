import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * What the line beside the "Draft this from their site" button should say,
 * and — the part that was actually missing — how it should look.
 *
 * The card used to render the failure message into the same element, in the
 * same muted grey, that carries the neutral hint. A failed draft therefore
 * swapped one grey sentence for another, which is why a working button could
 * be reported as doing nothing at all: there was no visual difference between
 * "not started" and "just failed".
 *
 * Resolved as a value rather than as inline ternaries so the three states can
 * be asserted without rendering — this repo's vitest environment is `node`
 * and has no component-rendering setup at all.
 */

export type DraftTone = "idle" | "busy" | "error";

export type DraftStatus = {
  tone: DraftTone;
  message: string;
};

export const DRAFT_IDLE_MESSAGE =
  "Reads a few pages of their site. You review it before it saves.";

/**
 * Names the duration on purpose. Drafting measured 16.1s against a real
 * domain locally, and production pays a cold isolate on top of that (every
 * server-function request there starts a new one). A control that gives no
 * indication it will take that long is indistinguishable from a hung one,
 * and "I clicked it and nothing happened" is exactly how that gets reported.
 */
export const DRAFT_BUSY_MESSAGE =
  "Reading their site. This can take up to a minute.";

const DRAFT_ERROR_FALLBACK = "Couldn't draft from the site.";

export function resolveDraftStatus(input: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}): DraftStatus {
  // Running wins over a previous failure: a retry must not show the stale
  // error beside a button that is working right now.
  if (input.isPending) return { tone: "busy", message: DRAFT_BUSY_MESSAGE };
  if (input.isError) {
    return {
      tone: "error",
      message: getStandardErrorMessage(input.error, DRAFT_ERROR_FALLBACK),
    };
  }
  return { tone: "idle", message: DRAFT_IDLE_MESSAGE };
}
