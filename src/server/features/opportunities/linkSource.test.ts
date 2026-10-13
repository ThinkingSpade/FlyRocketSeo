import { describe, expect, it, vi } from "vitest";
import { parseLinkSource, captureLinkSource } from "./linkSource";
import { detectInternalLink } from "./detectors";
import { evidence } from "./evidence.fixture";
const external = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/server/lib/audit/url-policy", () => ({
  fetchValidatingEveryHop: external.fetch,
}));

describe("captured source text for internal links", () => {
  it("uses the document base URL to recognize an existing relative destination link", () => {
    const source = parseLinkSource(
      '<base href="/resources/"><main><p>coffee service for offices</p><a href="service">Plans</a></main>',
      "https://example.com/article",
      "2026-10-13T12:00:00Z",
    );
    expect(source.links).toEqual(["https://example.com/resources/service"]);
    expect(
      detectInternalLink({
        source,
        destination: {
          url: "https://example.com/resources/service",
          impressions: 900,
          position: 8,
        },
        phrase: "coffee service",
        evidence: evidence(),
      }),
    ).toBeNull();
  });
  it("retains real paragraph locations and absolute outgoing links", () => {
    const source = parseLinkSource(
      '<main><p>Our coffee service helps offices.</p><p><a href="/about">Our team</a></p></main>',
      "https://example.com/article",
      "2026-10-13T12:00:00Z",
    );
    expect(source.locations).toEqual([
      { location: "paragraph 1", text: "Our coffee service helps offices." },
    ]);
    expect(source.links).toEqual(["https://example.com/about"]);
  });
  it("ignores script, navigation, footer and already linked anchor text", () => {
    const html =
      '<nav><p>coffee service</p></nav><main><script>coffee service</script><p><a href="/other">coffee service</a></p><p>Office news</p></main><footer><p>coffee service</p></footer>';
    const source = parseLinkSource(
      html,
      "https://example.com/article",
      "2026-10-13T12:00:00Z",
    );
    expect(
      detectInternalLink({
        source,
        destination: {
          url: "https://example.com/service",
          impressions: 900,
          position: 8,
        },
        phrase: "coffee service",
        evidence: evidence(),
      }),
    ).toBeNull();
  });
  it("retains query URL identity and avoids a recommendation when destination already linked", () => {
    const source = parseLinkSource(
      '<p>coffee service</p><a href="/service?plan=office#details">Plans</a>',
      "https://example.com/article",
      "2026-10-13T12:00:00Z",
    );
    expect(
      detectInternalLink({
        source,
        destination: {
          url: "https://example.com/service?plan=office",
          impressions: 900,
          position: 8,
        },
        phrase: "coffee service",
        evidence: evidence(),
      }),
    ).toBeNull();
  });
});

describe("protected source capture", () => {
  it("rejects pages outside the authenticated project's website origin", async () => {
    await expect(
      captureLinkSource(
        "https://elsewhere.com/source",
        "https://elsewhere.com/target",
        "example.com",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("pins redirect hops to the project and parses an actual successful HTML response", async () => {
    external.fetch.mockImplementationOnce(
      async (
        _url: string,
        _init: RequestInit,
        options: { allowHop: (url: URL) => boolean },
      ) => {
        expect(options.allowHop(new URL("https://example.com/next"))).toBe(
          true,
        );
        expect(options.allowHop(new URL("https://other.com/next"))).toBe(false);
        return {
          response: new Response("<p>coffee service for offices</p>", {
            headers: { "content-type": "text/html" },
          }),
          finalUrl: "https://example.com/source",
        };
      },
    );
    expect(
      await captureLinkSource(
        "https://example.com/source",
        "https://example.com/target",
        "example.com",
      ),
    ).toMatchObject({
      statusCode: 200,
      locations: [{ text: "coffee service for offices" }],
    });
  });
  it("failed, redirected or oversized captures cannot establish link absence", async () => {
    external.fetch.mockResolvedValueOnce({
      response: new Response("unavailable", {
        status: 503,
        headers: { "content-type": "text/html" },
      }),
      finalUrl: "https://example.com/source",
    });
    await expect(
      captureLinkSource(
        "https://example.com/source",
        "https://example.com/target",
        "example.com",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    external.fetch.mockResolvedValueOnce({
      response: new Response("<p>text</p>", {
        headers: { "content-type": "text/html" },
      }),
      finalUrl: "https://example.com/different",
    });
    await expect(
      captureLinkSource(
        "https://example.com/source",
        "https://example.com/target",
        "example.com",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    external.fetch.mockResolvedValueOnce({
      response: new Response("x".repeat(400001), {
        headers: { "content-type": "text/html" },
      }),
      finalUrl: "https://example.com/source",
    });
    await expect(
      captureLinkSource(
        "https://example.com/source",
        "https://example.com/target",
        "example.com",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
