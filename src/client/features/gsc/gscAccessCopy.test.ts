import { describe, expect, it } from "vitest";
import { getGscAccessNotice } from "./gscAccessCopy";
import type { GscAccessFailureReason } from "@/shared/gsc";

const ALL_REASONS: GscAccessFailureReason[] = [
  "not_connected",
  "requires_reconnect",
  "api_not_configured",
  "permission_denied",
];

describe("getGscAccessNotice", () => {
  it("invites a first connection when no property is bound yet", () => {
    const notice = getGscAccessNotice("not_connected");

    expect(notice.action.kind).toBe("connect");
    expect(notice.tone).toBe("neutral");
  });

  it("asks for a reconnect when the stored grant no longer works", () => {
    const notice = getGscAccessNotice("requires_reconnect");

    expect(notice.action.kind).toBe("reconnect");
    expect(notice.tone).toBe("warning");
    expect(notice.title).toMatch(/expired/i);
  });

  it("points at the API library when Search Console API is switched off", () => {
    const notice = getGscAccessNotice("api_not_configured");

    expect(notice.action).toMatchObject({
      kind: "enable_api",
      href: "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
    });
    expect(notice.tone).toBe("warning");
  });

  it("asks for a reconnect when Google denies the bound property", () => {
    const notice = getGscAccessNotice("permission_denied");

    expect(notice.action.kind).toBe("reconnect");
    expect(notice.title).toMatch(/access/i);
  });

  it("never reuses the first-run wording for a property that is already bound", () => {
    const firstRun = getGscAccessNotice("not_connected");

    for (const reason of ALL_REASONS.filter((r) => r !== "not_connected")) {
      expect(getGscAccessNotice(reason).title).not.toBe(firstRun.title);
    }
  });

  it("gives every reason a title and an action label", () => {
    for (const reason of ALL_REASONS) {
      const notice = getGscAccessNotice(reason);
      expect(notice.title.length).toBeGreaterThan(0);
      expect(notice.action.label.length).toBeGreaterThan(0);
    }
  });
});
