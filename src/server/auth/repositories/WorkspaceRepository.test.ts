import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@/db/schema", () => ({
  member: {
    organizationId: "member.organizationId",
    userId: "member.userId",
  },
  organization: {
    id: "organization.id",
    name: "organization.name",
    slug: "organization.slug",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn((column: unknown) => ({ ascending: column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: column, value })),
  notLike: vi.fn((column: unknown, pattern: unknown) => ({
    notLike: column,
    pattern,
  })),
}));

import { eq, notLike } from "drizzle-orm";
import { DELEGATED_ORGANIZATION_ID_PATTERN } from "@/server/auth/delegated-organization-id";
import { WorkspaceRepository } from "./WorkspaceRepository";

function mockSelectRows(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  mocks.select.mockReturnValue({ from });

  return { from, innerJoin, orderBy, where };
}

describe("WorkspaceRepository.listWorkspacesForUser", () => {
  beforeEach(() => {
    mocks.select.mockReset();
  });

  it("returns the workspaces behind the user's membership rows", async () => {
    mockSelectRows([
      { id: "team-org", name: "Acme", slug: "acme" },
      { id: "client-org", name: "Beta", slug: "beta" },
    ]);

    await expect(
      WorkspaceRepository.listWorkspacesForUser("user-1"),
    ).resolves.toEqual([
      { id: "team-org", name: "Acme", slug: "acme" },
      { id: "client-org", name: "Beta", slug: "beta" },
    ]);
  });

  it("reads from member and joins organization onto it", async () => {
    // The direction of this join is the security property. Selecting FROM
    // `organization` and filtering by membership would list every workspace on
    // the deployment the moment someone dropped the filter; selecting FROM
    // `member` cannot produce a row the user does not already own.
    const query = mockSelectRows([]);

    await WorkspaceRepository.listWorkspacesForUser("user-1");

    expect(query.from).toHaveBeenCalledWith({
      organizationId: "member.organizationId",
      userId: "member.userId",
    });
    expect(query.innerJoin).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith("organization.id", "member.organizationId");
  });

  it("scopes the rows to this user alone", async () => {
    mockSelectRows([]);

    await WorkspaceRepository.listWorkspacesForUser("user-1");

    expect(eq).toHaveBeenCalledWith("member.userId", "user-1");
  });

  it("excludes delegated organizations", async () => {
    // A delegated organization is per-user scaffolding, and the hosted path
    // re-resolves away from one on every request. Listing it would offer a
    // destination that undoes itself on the next page load.
    mockSelectRows([]);

    await WorkspaceRepository.listWorkspacesForUser("user-1");

    expect(notLike).toHaveBeenCalledWith(
      "member.organizationId",
      DELEGATED_ORGANIZATION_ID_PATTERN,
    );
  });
});
