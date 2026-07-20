import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class GscApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly body?: string,
    ) {
      super(message);
      this.name = "GscApiError";
    }
  }

  class GscTokenError extends Error {
    constructor(message = "token unavailable") {
      super(message);
      this.name = "GscTokenError";
    }
  }

  return {
    listSites: vi.fn(),
    upsert: vi.fn(),
    getByProjectId: vi.fn(),
    deleteByProjectId: vi.fn(),
    existsForConnector: vi.fn(),
    dbDelete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    GscApiError,
    GscTokenError,
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { delete: mocks.dbDelete } }));
vi.mock("@/server/lib/gscClient", () => ({
  createGscClient: () => ({ listSites: mocks.listSites }),
  GscApiError: mocks.GscApiError,
  GscTokenError: mocks.GscTokenError,
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {
    upsert: mocks.upsert,
    getByProjectId: mocks.getByProjectId,
    deleteByProjectId: mocks.deleteByProjectId,
    existsForConnector: mocks.existsForConnector,
  },
}));

const baseInput = {
  projectId: "p1",
  organizationId: "org1",
  userId: "u1",
  userEmail: "alice@example.com",
};

describe("GscService.setSite", () => {
  beforeEach(() => {
    mocks.listSites.mockReset();
    mocks.upsert.mockReset();
  });

  it("upserts a verified property using the connector's identity", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    mocks.upsert.mockResolvedValue({ siteUrl: "https://x/" });
    const { GscService } = await import("./GscService");

    await GscService.setSite({ ...baseInput, siteUrl: "https://x/" });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        siteUrl: "https://x/",
        connectedByUserId: "u1",
        connectedAccountEmail: "alice@example.com",
      }),
    );
  });

  it("rejects an unverified property with FORBIDDEN", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteUnverifiedUser" },
    ]);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.setSite({ ...baseInput, siteUrl: "https://x/" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a property not on the grant with NOT_FOUND", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.setSite({ ...baseInput, siteUrl: "https://not-mine/" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("GscService.listSitesForUserWithGrantStatus", () => {
  beforeEach(() => {
    mocks.listSites.mockReset();
    mocks.dbDelete.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns available sites when the grant is healthy", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
      errorReason: null,
      requiresReconnect: false,
    });
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("unlinks the dead grant and asks for reconnect when no token can be minted", async () => {
    mocks.listSites.mockRejectedValue(
      new mocks.GscTokenError("secret-access-token"),
    );
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      sites: [],
      errorReason: "requires_reconnect",
      requiresReconnect: true,
    });
    expect(mocks.dbDelete).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[GSC] Unlinking stored grant after token failure",
      { reason: "requires_reconnect", status: null },
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "secret-access-token",
    );
  });

  it.each([
    '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
    '{"error":{"status":"SERVICE_DISABLED"}}',
    "Search Console API has not been used in project 123 before",
    "Search Console API is disabled for this project",
  ])(
    "reports an API-not-configured 403 without unlinking (%s)",
    async (body) => {
      mocks.listSites.mockRejectedValue(
        new mocks.GscApiError(403, "Search Console denied access", body),
      );
      const { GscService } = await import("./GscService");

      await expect(
        GscService.listSitesForUserWithGrantStatus("u1"),
      ).resolves.toEqual({
        sites: [],
        errorReason: "api_not_configured",
        requiresReconnect: false,
      });
      expect(mocks.dbDelete).not.toHaveBeenCalled();
    },
  );

  it.each([
    "forbidden",
    '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
  ])(
    "treats a retryable 403 as temporary without unlinking (%s)",
    async (body) => {
      mocks.listSites.mockRejectedValue(
        new mocks.GscApiError(403, "Search Console denied access", body),
      );
      const { GscService } = await import("./GscService");

      await expect(
        GscService.listSitesForUserWithGrantStatus("u1"),
      ).resolves.toEqual({
        sites: [],
        errorReason: "temporary",
        requiresReconnect: false,
      });
      expect(mocks.dbDelete).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith("[GSC] Unable to list sites", {
        reason: "temporary",
        status: 403,
      });
    },
  );

  it.each([
    '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
    '{"error":{"status":"PERMISSION_DENIED"}}',
  ])("asks for reconnect on a missing-scope 403 (%s)", async (body) => {
    mocks.listSites.mockRejectedValue(
      new mocks.GscApiError(403, "secret-token", body),
    );
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      sites: [],
      errorReason: "requires_reconnect",
      requiresReconnect: true,
    });
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[GSC] Unable to list sites", {
      reason: "requires_reconnect",
      status: 403,
    });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "secret-token",
    );
  });

  it("asks for reconnect without unlinking on a 401", async () => {
    mocks.listSites.mockRejectedValue(
      new mocks.GscApiError(401, "unauthenticated"),
    );
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      sites: [],
      errorReason: "requires_reconnect",
      requiresReconnect: true,
    });
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])(
    "reports status %s as temporary without unlinking",
    async (status) => {
      mocks.listSites.mockRejectedValue(
        new mocks.GscApiError(status, "temporary failure"),
      );
      const { GscService } = await import("./GscService");

      await expect(
        GscService.listSitesForUserWithGrantStatus("u1"),
      ).resolves.toEqual({
        sites: [],
        errorReason: "temporary",
        requiresReconnect: false,
      });
      expect(mocks.dbDelete).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith("[GSC] Unable to list sites", {
        reason: "temporary",
        status,
      });
    },
  );

  it("reports a network failure as temporary", async () => {
    mocks.listSites.mockRejectedValue(new TypeError("fetch failed"));
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      sites: [],
      errorReason: "temporary",
      requiresReconnect: false,
    });
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[GSC] Unable to list sites", {
      reason: "temporary",
      status: null,
    });
  });

  it("rethrows a non-network TypeError as a programming defect", async () => {
    const programmingError = new TypeError(
      "client.listSites is not a function",
    );
    mocks.listSites.mockRejectedValue(programmingError);
    const { GscService } = await import("./GscService");

    await expect(GscService.listSitesForUserWithGrantStatus("u1")).rejects.toBe(
      programmingError,
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("keeps unclassified errors reportable", async () => {
    const unexpected = new Error("unexpected");
    mocks.listSites.mockRejectedValue(unexpected);
    const { GscService } = await import("./GscService");

    await expect(GscService.listSitesForUserWithGrantStatus("u1")).rejects.toBe(
      unexpected,
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });
});

describe("GscService.disconnect", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.deleteByProjectId.mockReset().mockResolvedValue(undefined);
    mocks.existsForConnector.mockReset();
    mocks.dbDelete.mockClear();
  });

  it("unlinks the connector's grant when they disconnect their last project", async () => {
    mocks.getByProjectId.mockResolvedValue({ connectedByUserId: "u1" });
    mocks.existsForConnector.mockResolvedValue(false);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnector).toHaveBeenCalledWith("u1");
    expect(mocks.dbDelete).toHaveBeenCalled(); // grant unlinked
  });

  it("keeps the grant when the connector still has another connected project", async () => {
    mocks.getByProjectId.mockResolvedValue({ connectedByUserId: "u1" });
    mocks.existsForConnector.mockResolvedValue(true);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("never revokes a grant when a different member disconnects the connection", async () => {
    mocks.getByProjectId.mockResolvedValue({ connectedByUserId: "owner" });
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "other-member" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnector).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("unlinks the caller's dangling grant when no property was ever bound", async () => {
    // Linked Google but never picked a property → no connection row. Disconnect
    // should still drop the caller's own grant.
    mocks.getByProjectId.mockResolvedValue(null);
    mocks.existsForConnector.mockResolvedValue(false);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.existsForConnector).toHaveBeenCalledWith("u1");
    expect(mocks.dbDelete).toHaveBeenCalled(); // grant unlinked
  });
});
