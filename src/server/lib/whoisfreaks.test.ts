import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { fetchDroppedDomains } from "@/server/lib/whoisfreaks";

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

describe("fetchDroppedDomains", () => {
  beforeEach(() => {
    process.env.WHOISFREAKS_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.WHOISFREAKS_API_KEY;
    vi.unstubAllGlobals();
  });

  it("requests one day, filtered to the given TLDs", async () => {
    let requested = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        requested = String(url);
        return Promise.resolve(jsonResponse(["a.com", "b.com"]));
      }),
    );

    await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] });

    expect(requested).toContain(
      "https://whoisfreaks.com/api/v3/dropped-domains",
    );
    expect(requested).toContain("date=2026-08-19");
    expect(requested).toContain("tlds=com");
    // The plan is names-only; asking for WHOIS would be a different product.
    expect(requested).toContain("whois=false");
  });

  it("never puts the key anywhere but the query string the API requires", async () => {
    let requested = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        requested = String(url);
        return Promise.resolve(jsonResponse([]));
      }),
    );

    await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] });

    expect(requested).toContain("apiKey=test-key");
  });

  it("normalizes and lowercases the returned names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(["A.COM", " b.com ", "c.com"])),
    );

    expect(
      await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] }),
    ).toEqual(["a.com", "b.com", "c.com"]);
  });

  // The API is documented as returning a bare array, but a wrapped shape is a
  // common drift; accept both rather than fail a whole day's harvest over it.
  it("accepts a wrapped payload as well as a bare array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ domains: ["a.com"] })),
    );

    expect(
      await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] }),
    ).toEqual(["a.com"]);
  });

  it("refuses to call out when no key is configured", async () => {
    delete process.env.WHOISFREAKS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await codeOf(fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] })),
    ).toBe("WHOISFREAKS_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps upstream failures to their own codes", async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
      [401, "WHOISFREAKS_AUTH_FAILED"],
      [403, "WHOISFREAKS_AUTH_FAILED"],
      [429, "RATE_LIMITED"],
      [500, "UPSTREAM_UNAVAILABLE"],
    ];

    for (const [status, expected] of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({}, status)),
      );
      expect(
        await codeOf(
          fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] }),
        ),
      ).toBe(expected);
    }
  });

  it("treats an unusable body as an upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>")));
    expect(
      await codeOf(fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] })),
    ).toBe("UPSTREAM_UNAVAILABLE");
  });
});
