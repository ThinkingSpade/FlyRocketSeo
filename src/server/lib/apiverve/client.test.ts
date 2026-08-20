import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiverveGet } from "@/server/lib/apiverve/client";
import { AppError } from "@/server/lib/errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR_THROWN";
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_AN_APP_ERROR";
  }
}

describe("apiverveGet", () => {
  beforeEach(() => {
    process.env.APIVERVE_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.APIVERVE_API_KEY;
    vi.unstubAllGlobals();
  });

  it("sends the key as a header and the params as query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiverveGet("domainexpiration", { domain: "example.com" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://api.apiverve.com/v1/domainexpiration?domain=example.com",
    );
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
      "test-key",
    );
  });

  it("refuses to call out at all when no key is configured", async () => {
    delete process.env.APIVERVE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(
      "APIVERVE_NOT_CONFIGURED",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps each upstream status to its own code", async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
      [400, "VALIDATION_ERROR"],
      [401, "APIVERVE_AUTH_FAILED"],
      [403, "APIVERVE_CREDITS_EXHAUSTED"],
      [429, "RATE_LIMITED"],
      [500, "UPSTREAM_UNAVAILABLE"],
      [503, "UPSTREAM_UNAVAILABLE"],
    ];

    for (const [status, expected] of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({}, status)),
      );
      expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(expected);
    }
  });

  it("treats a transport failure as an upstream outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timed out")));
    expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });

  it("treats a non-JSON body as an upstream outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>nope</html>")),
    );
    expect(await codeOf(apiverveGet("domainexpiration", {}))).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });
});
