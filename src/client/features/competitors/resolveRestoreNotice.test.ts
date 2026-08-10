import { describe, expect, it } from "vitest";
import { resolveRestoreNotice } from "./resolveRestoreNotice";

describe("resolveRestoreNotice", () => {
  // Finding 1, scenario 1: a run for americavending.com expires, the user
  // submits a brand-new target deliotx.com -- the notice must not keep
  // claiming "your last run" for a domain that is not on screen.
  it("refuses an expired notice for a different client's domain", () => {
    expect(
      resolveRestoreNotice({
        target: "deliotx.com",
        hasLiveResult: false,
        outcome: "expired",
        expiredLabel: "americavending.com",
      }),
    ).toBeNull();
  });

  // Finding 1, scenario 2: the user re-runs the same domain and a live table
  // is now on screen -- the stale expired notice must stop claiming
  // otherwise, since nothing invalidates the restore query on run completion.
  it("suppresses the expired notice once a live result exists", () => {
    expect(
      resolveRestoreNotice({
        target: "americavending.com",
        hasLiveResult: true,
        outcome: "expired",
        expiredLabel: "americavending.com",
      }),
    ).toBeNull();
  });

  it("shows the expired notice for the matching domain with no live result", () => {
    expect(
      resolveRestoreNotice({
        target: "americavending.com",
        hasLiveResult: false,
        outcome: "expired",
        expiredLabel: "americavending.com",
      }),
    ).toBe("expired");
  });

  it("shows the expired notice when no target is on screen yet", () => {
    expect(
      resolveRestoreNotice({
        target: "",
        hasLiveResult: false,
        outcome: "expired",
        expiredLabel: "americavending.com",
      }),
    ).toBe("expired");
  });

  // `unreadable` carries no label (the hook only exposes one for `expired`
  // and `ready`), so it cannot be domain-scoped the same way -- and its own
  // copy never names a domain, so it is not a wrong-domain claim either way.
  it("shows the unreadable notice regardless of the target on screen", () => {
    expect(
      resolveRestoreNotice({
        target: "deliotx.com",
        hasLiveResult: false,
        outcome: "unreadable",
        expiredLabel: null,
      }),
    ).toBe("unreadable");
  });

  it("suppresses the unreadable notice once a live result exists", () => {
    expect(
      resolveRestoreNotice({
        target: "deliotx.com",
        hasLiveResult: true,
        outcome: "unreadable",
        expiredLabel: null,
      }),
    ).toBeNull();
  });

  it.each(["none", "ready", null] as const)(
    "shows no notice for outcome %s",
    (outcome) => {
      expect(
        resolveRestoreNotice({
          target: "deliotx.com",
          hasLiveResult: false,
          outcome,
          expiredLabel: null,
        }),
      ).toBeNull();
    },
  );
});
