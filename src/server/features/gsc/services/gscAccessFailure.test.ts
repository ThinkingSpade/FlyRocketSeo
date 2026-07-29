import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GscNotConnectedError,
  classifyGscAccessFailure,
  toGscUnavailable,
} from "./GscService";

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
    upsert: vi.fn(),
    getByProjectId: vi.fn(),
    deleteByProjectId: vi.fn(),
    existsForConnector: vi.fn(),
  },
}));

describe("classifyGscAccessFailure", () => {
  it("reports a project with no bound property as not connected", async () => {
    expect(classifyGscAccessFailure(new GscNotConnectedError("p1"))).toBe(
      "not_connected",
    );
  });

  it("asks for reconnect when no access token can be minted", async () => {
    expect(classifyGscAccessFailure(new mocks.GscTokenError())).toBe(
      "requires_reconnect",
    );
  });

  it("asks for reconnect on a 401", async () => {
    expect(
      classifyGscAccessFailure(
        new mocks.GscApiError(401, "unauthenticated", "unauthenticated"),
      ),
    ).toBe("requires_reconnect");
  });

  it.each([
    '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
    '{"error":{"status":"SERVICE_DISABLED"}}',
    "Search Console API has not been used in project 123 before",
    "Search Console API is disabled for this project",
  ])("reports an API-not-configured 403 (%s)", async (body) => {
    expect(
      classifyGscAccessFailure(new mocks.GscApiError(403, "denied", body)),
    ).toBe("api_not_configured");
  });

  it.each([
    '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
    '{"error":{"status":"PERMISSION_DENIED"}}',
    "forbidden",
  ])("reports any other 403 as a denied property (%s)", async (body) => {
    expect(
      classifyGscAccessFailure(new mocks.GscApiError(403, "denied", body)),
    ).toBe("permission_denied");
  });

  it.each([429, 500, 503])(
    "leaves status %s unclassified so the caller surfaces a real fault",
    async (status) => {
      expect(
        classifyGscAccessFailure(new mocks.GscApiError(status, "later")),
      ).toBeNull();
    },
  );

  it("leaves an unexpected error unclassified", async () => {
    expect(classifyGscAccessFailure(new Error("boom"))).toBeNull();
  });
});

describe("toGscUnavailable", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ctx = { projectId: "p1", surface: "searchPerformanceReport" };

  it("returns the reason so the client can offer a reconnect", async () => {
    expect(toGscUnavailable(new mocks.GscTokenError(), ctx)).toEqual({
      connected: false,
      reason: "requires_reconnect",
    });
  });

  it("logs a bound-but-failing property without leaking the error body", async () => {
    toGscUnavailable(
      new mocks.GscApiError(403, "secret-token", "secret-body"),
      ctx,
    );

    expect(console.warn).toHaveBeenCalledWith(
      "[GSC] Search Console read failed",
      {
        surface: "searchPerformanceReport",
        projectId: "p1",
        reason: "permission_denied",
        status: 403,
      },
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "secret",
    );
  });

  it("stays quiet when the project simply has no property bound yet", async () => {
    expect(toGscUnavailable(new GscNotConnectedError("p1"), ctx)).toEqual({
      connected: false,
      reason: "not_connected",
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("rethrows a real fault instead of hiding it as disconnected", async () => {
    const outage = new mocks.GscApiError(503, "unavailable");

    expect(() => toGscUnavailable(outage, ctx)).toThrow(outage);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
