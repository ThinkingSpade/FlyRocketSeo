import { describe, expect, it } from "vitest";
import { shouldAutoRunDiscovery } from "./shouldAutoRunDiscovery";

const base = {
  outcome: "none" as const,
  restoreFailed: false,
  hasDomain: true,
  hasCredits: true,
  alreadyAttempted: false,
};

describe("shouldAutoRunDiscovery", () => {
  it("runs when there is no prior run and both preconditions hold", () => {
    expect(shouldAutoRunDiscovery(base)).toBe(true);
  });

  it("does not run while the restore is still resolving", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: null })).toBe(false);
  });

  it("does not run on a STALE 'none' left behind by a failed restore refetch", () => {
    // The exact re-billing path this input exists for. query-core keeps
    // `state.data` when a refetch errors, and `outcome` is derived from
    // `query.data` alone -- so after the paid call's own settle-time refetch
    // fails, the next mount still reads the pre-call "none". Without this
    // check that is a second paid Labs call for a project just billed, under
    // a banner that says "Nothing was charged."
    expect(shouldAutoRunDiscovery({ ...base, restoreFailed: true })).toBe(
      false,
    );
  });

  it("does not run when a run was already restored", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: "ready" })).toBe(false);
  });

  it("does NOT auto-run an expired run: retention must not become a charge", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: "expired" })).toBe(false);
  });

  it("does not auto-run an unreadable run", () => {
    expect(shouldAutoRunDiscovery({ ...base, outcome: "unreadable" })).toBe(
      false,
    );
  });

  it("does not run without a project domain", () => {
    expect(shouldAutoRunDiscovery({ ...base, hasDomain: false })).toBe(false);
  });

  it("does not run without credits", () => {
    expect(shouldAutoRunDiscovery({ ...base, hasCredits: false })).toBe(false);
  });

  it("does not run twice in one mounted session", () => {
    expect(shouldAutoRunDiscovery({ ...base, alreadyAttempted: true })).toBe(
      false,
    );
  });
});
