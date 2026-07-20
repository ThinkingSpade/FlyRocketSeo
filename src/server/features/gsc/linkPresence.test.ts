import { describe, expect, it } from "vitest";
import { analyzeLinkPresence, normalizeForLinkMatch } from "./linkPresence";

describe("normalizeForLinkMatch", () => {
  it("ignores protocol, www, trailing slash, query, and hash", () => {
    expect(normalizeForLinkMatch("https://www.x.com/a/?utm=1#top")).toBe(
      "x.com/a",
    );
    expect(normalizeForLinkMatch("http://x.com/a")).toBe("x.com/a");
  });

  it("resolves relative hrefs against the source page", () => {
    expect(normalizeForLinkMatch("/coffee/", "https://x.com/blog/post/")).toBe(
      "x.com/coffee",
    );
  });

  it("rejects non-http schemes", () => {
    expect(normalizeForLinkMatch("mailto:a@b.c")).toBeNull();
    expect(normalizeForLinkMatch("javascript:void(0)", "https://x.com/")).toBe(
      null,
    );
  });
});

describe("analyzeLinkPresence", () => {
  const input = {
    sourceUrl: "https://x.com/blog/post/",
    targetUrl: "https://x.com/coffee/",
    phrase: "Office  Coffee",
  };

  it("detects existing links (absolute and relative) and phrase mentions", () => {
    const html = `<body><p>We love office coffee here.</p>
      <a href="/coffee/">our coffee page</a></body>`;
    expect(analyzeLinkPresence(html, input)).toEqual({
      linksToTarget: true,
      mentionsPhrase: true,
    });
  });

  it("reports a missing link and missing phrase", () => {
    const html = `<body><p>Vending machines only.</p>
      <a href="/vending/">vending</a>
      <script>const x = "office coffee";</script></body>`;
    expect(analyzeLinkPresence(html, input)).toEqual({
      linksToTarget: false,
      mentionsPhrase: false,
    });
  });
});
