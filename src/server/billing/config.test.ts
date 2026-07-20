import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOptionalEnvValueMock, isHostedServerAuthModeMock } = vi.hoisted(
  () => ({
    getOptionalEnvValueMock: vi.fn(),
    isHostedServerAuthModeMock: vi.fn(),
  }),
);

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: getOptionalEnvValueMock,
  isHostedServerAuthMode: isHostedServerAuthModeMock,
}));

import { isBillingEnabled } from "./config";

describe("isBillingEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isHostedServerAuthModeMock.mockResolvedValue(true);
  });

  it("returns false outside hosted mode", async () => {
    isHostedServerAuthModeMock.mockResolvedValue(false);

    await expect(isBillingEnabled()).resolves.toBe(false);
    expect(getOptionalEnvValueMock).not.toHaveBeenCalled();
  });

  it("returns false when the secret key is missing", async () => {
    getOptionalEnvValueMock.mockResolvedValue(undefined);

    await expect(isBillingEnabled()).resolves.toBe(false);
  });

  it("returns false when the secret key is empty", async () => {
    getOptionalEnvValueMock.mockResolvedValue("");

    await expect(isBillingEnabled()).resolves.toBe(false);
  });

  it("returns false when the secret key is whitespace", async () => {
    getOptionalEnvValueMock.mockResolvedValue(" \t\n ");

    await expect(isBillingEnabled()).resolves.toBe(false);
  });

  it("returns true when the secret key is nonblank", async () => {
    getOptionalEnvValueMock.mockResolvedValue("autumn-secret");

    await expect(isBillingEnabled()).resolves.toBe(true);
  });
});
