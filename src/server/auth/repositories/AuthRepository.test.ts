import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    query: {
      user: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  member: {
    id: "member.id",
    organizationId: "member.organizationId",
    userId: "member.userId",
    createdAt: "member.createdAt",
  },
  organization: {
    id: "organization.id",
    createdAt: "organization.createdAt",
  },
  user: {
    id: "user.id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn((column: unknown) => ({ ascending: column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  notLike: vi.fn((column: unknown, pattern: unknown) => ({
    notLike: column,
    pattern,
  })),
}));

import { notLike } from "drizzle-orm";
import { AuthRepository } from "./AuthRepository";
import { DELEGATED_ORGANIZATION_ID_PATTERN } from "@/server/auth/delegated-organization-id";

type MemberInsert = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

function mockSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  // `where` chains into `orderBy` as well as `limit`: both organization
  // lookups now filter delegated ids before ordering.
  const where = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ limit, orderBy, where }));
  mocks.select.mockReturnValue({ from });

  return { from, limit, orderBy, where };
}

describe("AuthRepository shared organization", () => {
  beforeEach(() => {
    mocks.insert.mockReset();
    mocks.select.mockReset();
  });

  it("finds the earliest-created organization", async () => {
    const query = mockSelectRows([{ id: "operator-org" }]);

    await expect(AuthRepository.findSharedOrganizationId()).resolves.toBe(
      "operator-org",
    );

    expect(query.orderBy).toHaveBeenCalledOnce();
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("excludes delegated organizations from the shared pick", async () => {
    // Without this filter the query returns the OLDEST organization outright,
    // and a per-user delegated workspace created minutes before the team's own
    // wins forever. Every hosted session then lands in an empty workspace
    // while the projects sit in the organization ranked second here.
    const query = mockSelectRows([{ id: "team-org" }]);

    await AuthRepository.findSharedOrganizationId();

    expect(query.where).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: DELEGATED_ORGANIZATION_ID_PATTERN }),
    );
  });

  it("excludes delegated organizations when reading a user's memberships", async () => {
    const query = mockSelectRows([{ organizationId: "team-org" }]);

    await expect(
      AuthRepository.findFirstOrganizationIdForUser("operator"),
    ).resolves.toBe("team-org");

    expect(query.where).toHaveBeenCalledOnce();
    expect(notLike).toHaveBeenCalledWith(
      "member.organizationId",
      DELEGATED_ORGANIZATION_ID_PATTERN,
    );
  });

  it("returns null when no shared organization exists", async () => {
    mockSelectRows([]);

    await expect(AuthRepository.findSharedOrganizationId()).resolves.toBeNull();
  });

  it("skips insertion when the user is already a member", async () => {
    mockSelectRows([{ id: "existing-member" }]);

    await AuthRepository.ensureMembership({
      userId: "operator",
      organizationId: "operator-org",
    });

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("inserts a conflict-safe member row with the default role", async () => {
    mockSelectRows([]);
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn((_input: MemberInsert) => ({ onConflictDoNothing }));
    mocks.insert.mockReturnValue({ values });

    await AuthRepository.ensureMembership({
      userId: "second-user",
      organizationId: "operator-org",
    });

    expect(values).toHaveBeenCalledOnce();
    const inserted = values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      organizationId: "operator-org",
      userId: "second-user",
      role: "member",
    });
    expect(typeof inserted?.id).toBe("string");
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });
});
