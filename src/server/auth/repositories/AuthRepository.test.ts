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
}));

import { AuthRepository } from "./AuthRepository";

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
  const where = vi.fn(() => ({ limit }));
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
