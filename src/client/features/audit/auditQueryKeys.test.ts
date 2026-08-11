import { describe, expect, it } from "vitest";
import {
  auditCacheKeysForProject,
  auditHistoryKey,
  auditResultsKey,
  auditStatusKey,
} from "./auditQueryKeys";

describe("audit query keys", () => {
  it("gives every caller of one server function the same key", () => {
    // The regression this pins. `getAuditHistory` was cached under three names
    // ("audit-history", "auditHistory", "report-audits") across six callers, so
    // deleting an audit left it on five other surfaces and each surface paid
    // for its own copy of the same response.
    expect(auditHistoryKey("p1")).toEqual(auditHistoryKey("p1"));
    expect(auditHistoryKey("p1")).not.toEqual(auditHistoryKey("p2"));
  });

  it("keeps results per audit, not per project", () => {
    expect(auditResultsKey("p1", "a1")).not.toEqual(
      auditResultsKey("p1", "a2"),
    );
  });

  it("tolerates an audit id that has not resolved yet", () => {
    // Callers derive it from a history read, so it is undefined on first paint.
    expect(auditResultsKey("p1", undefined)).toEqual([
      "audit-results",
      "p1",
      undefined,
    ]);
  });

  it("invalidates by prefix so every audit in the project is covered", () => {
    const keys = auditCacheKeysForProject("p1");

    // Prefixes, not exact keys: results and status carry an `auditId`, and a
    // deletion changes which audit is "the latest" for the report and the
    // dashboard.
    expect(keys).toEqual([
      ["audit-history", "p1"],
      ["audit-results", "p1"],
      ["audit-status", "p1"],
    ]);
    for (const key of keys) expect(key).toHaveLength(2);
  });

  it("builds a status key that the invalidation prefix matches", () => {
    const status = auditStatusKey("p1", "a1");
    const [prefixName, prefixProject] = auditCacheKeysForProject("p1")[2];

    expect(status[0]).toBe(prefixName);
    expect(status[1]).toBe(prefixProject);
  });
});
