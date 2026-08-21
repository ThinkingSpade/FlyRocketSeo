import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { fetchDroppedDomains } from "@/server/lib/whoisfreaks";

/** The real feed is gzipped, newline-delimited names with no header. */
function feedResponse(lines: string[], status = 200): Response {
  const body = gzipSync(Buffer.from(lines.join("\n"), "utf-8"));
  return new Response(body, { status });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status });
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

  // Pinned deliberately: the documented endpoint on the marketing host does not
  // exist and answers with a Next.js 404 PAGE, which parses as a failure only by
  // luck. This asserts the host/path verified against the live API.
  it("calls the verified files host, not the marketing host", async () => {
    let requested = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        requested = String(url);
        return Promise.resolve(feedResponse(["a.com"]));
      }),
    );

    await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] });

    expect(requested).toContain(
      "https://files.whoisfreaks.com/v3.1/download/domainer/dropped",
    );
    expect(requested).toContain("date=2026-08-19");
    expect(requested).toContain("apiKey=test-key");
    // Asking for WHOIS on this subscription returns 413 "upgrade your plans".
    expect(requested).toContain("whois=false");
  });

  it("decompresses the gzipped feed and normalizes names", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(feedResponse(["A.COM", " b.com ", "", "c.com"])),
    );

    expect(
      await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] }),
    ).toEqual(["a.com", "b.com", "c.com"]);
  });

  // There is no server-side TLD filter on this endpoint -- the download is the
  // whole day across every TLD, so narrowing has to happen client-side.
  it("filters to the requested TLDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          feedResponse(["a.com", "b.shop", "c.net", "d.xyz", "e.com"]),
        ),
    );

    expect(
      await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com", "net"] }),
    ).toEqual(["a.com", "c.net", "e.com"]);
  });

  it("handles CRLF line endings without corrupting names", async () => {
    const body = gzipSync(Buffer.from("a.com\r\nb.com\r\n", "utf-8"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));

    expect(
      await fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] }),
    ).toEqual(["a.com", "b.com"]);
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
      // Observed live when asking for a tier the subscription does not include.
      [413, "UPSTREAM_UNAVAILABLE"],
      [429, "RATE_LIMITED"],
      [500, "UPSTREAM_UNAVAILABLE"],
    ];

    for (const [status, expected] of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ status }, status)),
      );
      expect(
        await codeOf(
          fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] }),
        ),
      ).toBe(expected);
    }
  });

  it("treats an undecompressable body as an upstream failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not gzip at all")),
    );

    expect(
      await codeOf(fetchDroppedDomains({ date: "2026-08-19", tlds: ["com"] })),
    ).toBe("UPSTREAM_UNAVAILABLE");
  });
});
