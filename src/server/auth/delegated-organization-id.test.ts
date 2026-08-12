import { describe, expect, it } from "vitest";
import {
  DELEGATED_ORGANIZATION_ID_PATTERN,
  delegatedOrganizationId,
  isDelegatedOrganizationId,
} from "./delegated-organization-id";

/**
 * These three have to agree, because two of them are read by SQL and one by
 * TypeScript. When they drifted, the query that picks the deployment's shared
 * workspace could not tell a per-user delegated organization from the team's
 * own — and picked the delegated one, hiding every project behind an empty
 * workspace with no way to switch.
 */
describe("delegated organization ids", () => {
  it("builds an id the predicate recognizes", () => {
    expect(isDelegatedOrganizationId(delegatedOrganizationId("user-1"))).toBe(
      true,
    );
  });

  it("matches the id a real deployment already stored", () => {
    // Verbatim from production, so a change to the prefix fails here rather
    // than by orphaning live rows.
    expect(
      isDelegatedOrganizationId(
        "delegated-478b0ae9-f857-51fb-83d5-3390932eab4f",
      ),
    ).toBe(true);
  });

  it("does not match a real workspace id", () => {
    expect(isDelegatedOrganizationId("QKIb0ETRm0QTfsLF1LDCXWjV7H6ndedU")).toBe(
      false,
    );
  });

  it("anchors at the start rather than matching anywhere", () => {
    expect(isDelegatedOrganizationId("org-delegated-team")).toBe(false);
  });

  it("keeps the SQL pattern free of unescaped wildcards", () => {
    // The repository passes this to LIKE with no ESCAPE clause. A `%` or `_`
    // creeping into the prefix would widen it to match real workspaces, which
    // would exclude the team's own organization from being found at all.
    const prefix = DELEGATED_ORGANIZATION_ID_PATTERN.slice(0, -1);
    expect(DELEGATED_ORGANIZATION_ID_PATTERN.endsWith("%")).toBe(true);
    expect(prefix).not.toMatch(/[%_]/);
    expect(isDelegatedOrganizationId(`${prefix}anything`)).toBe(true);
  });
});
