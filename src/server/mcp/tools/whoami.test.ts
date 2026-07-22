import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP, type ToolExtra } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  autumnCheck: vi.fn(),
  isBillingEnabled: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: { check: mocks.autumnCheck },
}));

vi.mock("@/server/billing/config", () => ({
  isBillingEnabled: mocks.isBillingEnabled,
}));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://flyrocketseo.test/mcp",
  subject: "user_123",
  baseUrl: "https://flyrocketseo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://flyrocketseo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

describe("whoamiTool", () => {
  beforeEach(() => {
    mocks.autumnCheck.mockReset();
    mocks.isBillingEnabled.mockReset();
    mocks.isHostedServerAuthMode.mockReset().mockResolvedValue(true);
  });

  it("reports unlimited credits without calling Autumn when billing is disabled", async () => {
    mocks.isBillingEnabled.mockResolvedValue(false);
    const { whoamiTool } = await import("./whoami");

    const result = await whoamiTool.handler({}, toolExtra);

    expect(mocks.autumnCheck).not.toHaveBeenCalled();
    const first = result.content[0];
    if (first?.type !== "text") {
      throw new Error("expected a text content item");
    }
    expect(first.text).toContain(
      "Credits remaining: unlimited (billing disabled)",
    );
    expect(result.structuredContent).toMatchObject({
      mode: "hosted",
      creditsRemaining: null,
      creditsUnmetered: true,
    });
  });

  it("keeps numeric balances when billing is enabled", async () => {
    mocks.isBillingEnabled.mockResolvedValue(true);
    mocks.autumnCheck
      .mockResolvedValueOnce({ balance: { remaining: 12 } })
      .mockResolvedValueOnce({ balance: { remaining: 3 } });
    const { whoamiTool } = await import("./whoami");

    const result = await whoamiTool.handler({}, toolExtra);

    expect(mocks.autumnCheck).toHaveBeenCalledTimes(2);
    expect(result.structuredContent).toMatchObject({
      creditsRemaining: 15,
      creditsUnmetered: false,
    });
  });
});
