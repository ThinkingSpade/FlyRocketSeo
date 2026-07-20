import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
  findFirstOrganizationIdForUser: vi.fn(),
  findSharedOrganizationId: vi.fn(),
}));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: mocks,
}));

import { getOrJoinSharedHostedOrganization } from "./default-hosted-organization";

describe("getOrJoinSharedHostedOrganization", () => {
  beforeEach(() => {
    mocks.ensureMembership.mockReset();
    mocks.findFirstOrganizationIdForUser.mockReset();
    mocks.findSharedOrganizationId.mockReset();
  });

  it("joins the earliest existing organization instead of creating one", async () => {
    mocks.findSharedOrganizationId.mockResolvedValue("operator-org");
    mocks.ensureMembership.mockResolvedValue(undefined);
    const createOrganization = vi.fn();

    await expect(
      getOrJoinSharedHostedOrganization("second-user", createOrganization),
    ).resolves.toBe("operator-org");

    expect(mocks.ensureMembership).toHaveBeenCalledWith({
      userId: "second-user",
      organizationId: "operator-org",
    });
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("creates the shared organization only when no organization exists", async () => {
    mocks.findSharedOrganizationId.mockResolvedValue(null);
    const createOrganization = vi
      .fn()
      .mockResolvedValue({ id: "new-shared-org" });

    await expect(
      getOrJoinSharedHostedOrganization("first-user", createOrganization),
    ).resolves.toBe("new-shared-org");

    expect(createOrganization).toHaveBeenCalledOnce();
    expect(createOrganization).toHaveBeenCalledWith({
      name: "Team workspace",
      slug: "team-workspace",
      userId: "first-user",
    });
    expect(mocks.ensureMembership).not.toHaveBeenCalled();
  });

  it("re-resolves idempotently without creating another organization", async () => {
    mocks.findSharedOrganizationId.mockResolvedValue("operator-org");
    mocks.ensureMembership.mockResolvedValue(undefined);
    const createOrganization = vi.fn();

    await getOrJoinSharedHostedOrganization("second-user", createOrganization);
    await getOrJoinSharedHostedOrganization("second-user", createOrganization);

    expect(mocks.ensureMembership).toHaveBeenCalledTimes(2);
    expect(mocks.ensureMembership).toHaveBeenNthCalledWith(1, {
      userId: "second-user",
      organizationId: "operator-org",
    });
    expect(mocks.ensureMembership).toHaveBeenNthCalledWith(2, {
      userId: "second-user",
      organizationId: "operator-org",
    });
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("keeps the existing membership fallback when shared-org creation races", async () => {
    const createError = new Error("slug already exists");
    mocks.findSharedOrganizationId.mockResolvedValue(null);
    mocks.findFirstOrganizationIdForUser.mockResolvedValue("raced-org");
    const createOrganization = vi.fn().mockRejectedValue(createError);

    await expect(
      getOrJoinSharedHostedOrganization("first-user", createOrganization),
    ).resolves.toBe("raced-org");

    expect(mocks.findFirstOrganizationIdForUser).toHaveBeenCalledWith(
      "first-user",
    );
  });
});
