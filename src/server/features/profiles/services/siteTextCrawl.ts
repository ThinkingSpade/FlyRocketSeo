import * as cheerio from "cheerio";
import { fetchValidatingEveryHop } from "@/server/lib/audit/url-policy";

/**
 * A tiny, hard-capped read of a site's own words.
 *
 * Every limit here is a Cloudflare free-plan CPU limit in disguise. The site
 * audit crawl hit exactly that wall with cheerio plus large batches (its
 * fallback now fires on a crawl-phase throw for this reason), so this stays
 * deliberately smaller than it could be: a handful of pages, fetched
 * sequentially, each truncated before parsing. It exists to give a model
 * enough of the client's vocabulary to summarise them, not to inventory a
 * site -- the audit crawler already does that job properly.
 */

const MAX_PAGES = 5;
const FETCH_TIMEOUT_MS = 8000;
/** Truncate before cheerio sees it: parse cost scales with document size. */
const MAX_HTML_BYTES = 400_000;
const MAX_TEXT_CHARS = 4000;

type CrawledPage = { url: string; title: string; text: string };

/** Strips chrome that carries no information about the business. */
function extractVisibleText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, iframe, nav, footer, header").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}

/**
 * Same-origin links worth reading after the homepage.
 *
 * Ranked by path keyword rather than crawled breadth-first: a business
 * describes what it sells on /services and who it is on /about, and reading
 * those two beats reading five blog posts. Anything unmatched is ignored
 * rather than filling the budget.
 */
const PREFERRED_PATHS = [
  "service",
  "solution",
  "product",
  "what-we-do",
  "about",
  "industries",
];

function pickInternalLinks($: cheerio.CheerioAPI, origin: string): string[] {
  const found = new Map<string, number>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      return;
    }
    if (url.origin !== origin) return;
    const path = url.pathname.toLowerCase();
    if (path === "/" || path === "") return;
    const rank = PREFERRED_PATHS.findIndex((keyword) => path.includes(keyword));
    if (rank < 0) return;
    const clean = `${url.origin}${url.pathname}`;
    const existing = found.get(clean);
    if (existing === undefined || rank < existing) found.set(clean, rank);
  });

  return [...found.entries()]
    .toSorted((a, b) => a[1] - b[1])
    .map(([url]) => url)
    .slice(0, MAX_PAGES - 1);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    // Validated per hop. This built https://${domain} straight from user input
    // and followed redirects with NO url-policy check at all, so a domain of
    // "127.0.0.1:8787" -- or any page redirecting there -- had the Worker fetch
    // it. Every hop stays on the crawled host, which is what internal-link
    // crawling wants anyway.
    const response = await fetchValidatingEveryHop(
      url,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": "FlyRocketSEO/1.0 (+profile-draft)" },
      },
      { sameHostAs: new URL(url).hostname },
    );
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    return (await response.text()).slice(0, MAX_HTML_BYTES);
  } catch {
    // A refused, slow or malformed page costs us that page, never the draft.
    return null;
  }
}

function toPage(url: string, html: string): CrawledPage {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  return { url, title, text: extractVisibleText($) };
}

/**
 * Reads the homepage plus up to four service/about pages.
 *
 * Returns an empty array rather than throwing when the site cannot be read at
 * all: the caller degrades to "we couldn't read the site" instead of failing
 * the whole request, since the user can always type the profile themselves.
 */
export async function crawlSiteText(domain: string): Promise<CrawledPage[]> {
  const origin = domain.startsWith("http") ? domain : `https://${domain}`;
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return [];
  }

  const homeHtml = await fetchHtml(base.origin);
  if (!homeHtml) return [];

  const $home = cheerio.load(homeHtml);
  const pages: CrawledPage[] = [toPage(base.origin, homeHtml)];

  // Sequential, not parallel: five concurrent fetches plus five cheerio
  // parses is exactly the burst that trips the free-plan CPU limit.
  for (const link of pickInternalLinks($home, base.origin)) {
    const html = await fetchHtml(link);
    if (html) pages.push(toPage(link, html));
  }

  return pages;
}
