import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn((column: unknown) => ({ descending: column })),
  eq: vi.fn((column: unknown, value: unknown) => ({
    type: "eq",
    column,
    value,
  })),
  gt: vi.fn((column: unknown, value: unknown) => ({
    type: "gt",
    column,
    value,
  })),
  inArray: vi.fn((column: unknown, value: unknown) => ({
    type: "inArray",
    column,
    value,
  })),
}));

vi.mock("@/db", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
  },
}));

vi.mock("@/db/schema", () => ({
  invitation: {
    id: "invitation.id",
    organizationId: "invitation.organizationId",
    inviterId: "invitation.inviterId",
    email: "invitation.email",
    role: "invitation.role",
    status: "invitation.status",
    expiresAt: "invitation.expiresAt",
    createdAt: "invitation.createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  desc: mocks.desc,
  eq: mocks.eq,
  gt: mocks.gt,
  inArray: mocks.inArray,
}));

import { InviteRepository } from "./InviteRepository";

type InviteInsert = {
  id: string;
  email: string;
  organizationId: string;
  inviterId: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

describe("InviteRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a normalized pending member invite and returns its token", async () => {
    const values = vi
      .fn<(input: InviteInsert) => Promise<void>>()
      .mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values });
    const expiresAt = new Date("2026-07-27T12:00:00Z");

    const id = await InviteRepository.createInvite({
      email: " Teammate@Example.com ",
      organizationId: "org-1",
      inviterId: "user-1",
      expiresAt,
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        email: "teammate@example.com",
        organizationId: "org-1",
        inviterId: "user-1",
        role: "member",
        status: "pending",
        expiresAt,
      }),
    );
    expect(values.mock.calls[0]?.[0].createdAt).toBeInstanceOf(Date);
  });

  it("finds the newest unexpired pending or accepted invite", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ id: "invite-1", status: "pending" }]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    mocks.select.mockReturnValue({ from });

    await expect(
      InviteRepository.findActiveInviteByEmail(" Team@Example.com "),
    ).resolves.toEqual({ id: "invite-1", status: "pending" });

    expect(mocks.eq).toHaveBeenCalledWith(
      "invitation.email",
      "team@example.com",
    );
    expect(mocks.inArray).toHaveBeenCalledWith("invitation.status", [
      "pending",
      "accepted",
    ]);
    expect(mocks.gt).toHaveBeenCalledWith(
      "invitation.expiresAt",
      expect.any(Date),
    );
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("returns null when no active invite matches", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    mocks.select.mockReturnValue({ from });

    await expect(
      InviteRepository.findActiveInviteByEmail("none@example.com"),
    ).resolves.toBeNull();
  });

  it("marks every pending invite for the normalized email accepted", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mocks.update.mockReturnValue({ set });

    await InviteRepository.markInviteAccepted(" Team@Example.com ");

    expect(set).toHaveBeenCalledWith({ status: "accepted" });
    expect(mocks.eq).toHaveBeenCalledWith(
      "invitation.email",
      "team@example.com",
    );
    expect(mocks.eq).toHaveBeenCalledWith("invitation.status", "pending");
  });

  it("revokes an invite by token", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mocks.update.mockReturnValue({ set });

    await InviteRepository.revokeInvite("invite-1");

    expect(set).toHaveBeenCalledWith({ status: "canceled" });
    expect(mocks.eq).toHaveBeenCalledWith("invitation.id", "invite-1");
  });
});
