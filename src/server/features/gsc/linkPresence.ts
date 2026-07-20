import * as cheerio from "cheerio";

/**
 * Pure HTML analysis for the Link Opportunities checker: does this page already
 * link to the target, and does it mention the anchor phrase? Split from the
 * fetch so the matching rules are unit-testable.
 */

export type LinkPresence = {
  linksToTarget: boolean;
  mentionsPhrase: boolean;
};

/** Compare URLs ignoring protocol, www, trailing slash, hash, and query. */
export function normalizeForLinkMatch(
  url: string,
  baseUrl?: string,
): string | null {
  try {
    const parsed = new URL(url, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path =
      parsed.pathname.endsWith("/") && parsed.pathname !== "/"
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function analyzeLinkPresence(
  html: string,
  input: { sourceUrl: string; targetUrl: string; phrase: string },
): LinkPresence {
  const target = normalizeForLinkMatch(input.targetUrl);
  const $ = cheerio.load(html);

  let linksToTarget = false;
  if (target) {
    $("a[href]").each((_, el) => {
      if (linksToTarget) return;
      const href = $(el).attr("href");
      if (!href) return;
      if (normalizeForLinkMatch(href, input.sourceUrl) === target) {
        linksToTarget = true;
      }
    });
  }

  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript, svg").remove();
  const text = bodyClone.text().replace(/\s+/g, " ").toLowerCase();
  const mentionsPhrase = text.includes(
    input.phrase.trim().toLowerCase().replace(/\s+/g, " "),
  );

  return { linksToTarget, mentionsPhrase };
}
