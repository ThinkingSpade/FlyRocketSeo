import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/server/lib/errors";
import {
  fetchValidatingEveryHop,
  normalizeAndValidateStartUrl,
} from "@/server/lib/audit/url-policy";

describe("normalizeAndValidateStartUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds https when protocol is missing and strips hash", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ Status: 0, Answer: [] }), {
        status: 200,
        headers: { "content-type": "application/dns-json" },
      }),
    );

    await expect(
      normalizeAndValidateStartUrl("example.com/path#section"),
    ).resolves.toBe("https://example.com/path");
  });

  it("blocks localhost-like targets", async () => {
    await expect(
      normalizeAndValidateStartUrl("http://localhost:3000"),
    ).rejects.toMatchObject({
      code: "CRAWL_TARGET_BLOCKED",
    } satisfies Partial<AppError>);
  });

  it("blocks private ip targets", async () => {
    await expect(
      normalizeAndValidateStartUrl("http://192.168.0.10"),
    ).rejects.toMatchObject({
      code: "CRAWL_TARGET_BLOCKED",
    } satisfies Partial<AppError>);
  });

  it("rejects invalid URL input", async () => {
    await expect(
      normalizeAndValidateStartUrl("not a url"),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
  });
});

describe("fetchValidatingEveryHop", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A fetch stub that replays a scripted redirect chain. */
  function chain(...steps: Array<{ status: number; location?: string }>) {
    let call = 0;
    return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      const step = steps[Math.min(call++, steps.length - 1)];
      return new Response(null, {
        status: step.status,
        headers: step.location ? { location: step.location } : {},
      });
    });
  }

  it("refuses a redirect into loopback", async () => {
    // The actual hole: validation covered only the submitted URL, and
    // redirect:"follow" then let the remote server choose our next request.
    const fetchImpl = chain({
      status: 302,
      location: "http://127.0.0.1:8787/admin",
    });

    await expect(
      fetchValidatingEveryHop("https://example.com/a", {}, { fetchImpl }),
    ).rejects.toMatchObject({ code: "CRAWL_TARGET_BLOCKED" });

    // The blocked hop must never be requested.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect into a private range", async () => {
    const fetchImpl = chain({ status: 301, location: "http://10.0.0.5/" });
    await expect(
      fetchValidatingEveryHop("https://example.com/a", {}, { fetchImpl }),
    ).rejects.toMatchObject({ code: "CRAWL_TARGET_BLOCKED" });
  });

  it("refuses a redirect off the required host", async () => {
    const fetchImpl = chain({
      status: 302,
      location: "https://attacker.example/x",
    });
    await expect(
      fetchValidatingEveryHop(
        "https://example.com/a",
        {},
        { fetchImpl, sameHostAs: "example.com" },
      ),
    ).rejects.toMatchObject({ code: "CRAWL_TARGET_BLOCKED" });
  });

  it("follows a same-host redirect and returns the final response", async () => {
    const fetchImpl = chain(
      { status: 301, location: "/final" },
      { status: 200 },
    );

    const response = await fetchValidatingEveryHop(
      "https://example.com/a",
      {},
      { fetchImpl, sameHostAs: "example.com" },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses an endless redirect loop instead of following it", async () => {
    const fetchImpl = chain({ status: 302, location: "https://example.com/a" });
    await expect(
      fetchValidatingEveryHop("https://example.com/a", {}, { fetchImpl }),
    ).rejects.toMatchObject({ code: "CRAWL_TARGET_BLOCKED" });
  });

  it("always requests with manual redirect handling", async () => {
    const fetchImpl = chain({ status: 200 });
    await fetchValidatingEveryHop("https://example.com/a", {}, { fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      redirect: "manual",
    });
  });
});
