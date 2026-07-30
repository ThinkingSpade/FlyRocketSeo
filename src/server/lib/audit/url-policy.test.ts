import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/server/lib/errors";
import {
  fetchValidatingEveryHop,
  normalizeAndValidateStartUrl,
} from "@/server/lib/audit/url-policy";
import { isSameOrigin } from "@/server/lib/audit/url-utils";

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

  it("refuses a redirect the caller's origin rule rejects", async () => {
    const fetchImpl = chain({
      status: 302,
      location: "https://attacker.example/x",
    });
    await expect(
      fetchValidatingEveryHop(
        "https://example.com/a",
        {},
        { fetchImpl, allowHop: (u) => u.hostname === "example.com" },
      ),
    ).rejects.toMatchObject({ code: "CRAWL_TARGET_BLOCKED" });
  });

  it("refuses a redirect that only changes the port", async () => {
    // Adversarial review: a hostname-only check let this through, and the
    // Workers runtime can subrequest custom ports -- so a same-host redirect to
    // :8080/admin turned the phrase check into a content oracle against another
    // service on that machine.
    const fetchImpl = chain({
      status: 302,
      location: "http://example.com:8080/admin",
    });

    await expect(
      fetchValidatingEveryHop(
        "https://example.com/a",
        {},
        {
          fetchImpl,
          allowHop: (u) => isSameOrigin(u.toString(), "https://example.com"),
        },
      ),
    ).rejects.toMatchObject({ code: "CRAWL_TARGET_BLOCKED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows the ordinary www to apex canonical redirect", async () => {
    // The regression this predicate replaced: an exact-hostname pin rejected
    // this, and an audit could finish with a single failed page.
    const fetchImpl = chain(
      { status: 301, location: "https://example.com/" },
      { status: 200 },
    );

    const { response, redirected, finalUrl } = await fetchValidatingEveryHop(
      "https://www.example.com/",
      {},
      {
        fetchImpl,
        allowHop: (u) => isSameOrigin(u.toString(), "https://www.example.com"),
      },
    );

    expect(response.status).toBe(200);
    expect(redirected).toBe(true);
    expect(finalUrl).toBe("https://example.com/");
  });

  it("reports redirect metadata that response.redirected cannot", async () => {
    // Each hop is a separate manual fetch, so the final response has
    // redirected === false. Callers recording redirects must use ours.
    const fetchImpl = chain(
      { status: 301, location: "/final" },
      { status: 200 },
    );

    const result = await fetchValidatingEveryHop(
      "https://example.com/a",
      {},
      { fetchImpl },
    );

    expect(result.response.redirected).toBe(false);
    expect(result.redirected).toBe(true);
    expect(result.finalUrl).toBe("https://example.com/final");
  });

  it("follows a same-host redirect and returns the final response", async () => {
    const fetchImpl = chain(
      { status: 301, location: "/final" },
      { status: 200 },
    );

    const { response } = await fetchValidatingEveryHop(
      "https://example.com/a",
      {},
      { fetchImpl, allowHop: (u) => u.hostname === "example.com" },
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
