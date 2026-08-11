import { getDomain } from "tldts";
import type { CompetitorCategory } from "@/types/schemas/competitors";

/**
 * Static, network-free classifier that separates platforms/aggregators from
 * genuine competitors -- the piece `beatsYouCount` was missing (see
 * `rankSerpCompetitors.ts`'s own doc comment, written before this existed:
 * "no relevance classifier required"). A YouTube video or a Reddit thread
 * outranking the client on a query is a SERP feature, not a rival that can
 * take their business -- this function is the one place that judgement is
 * made, so the table, the verdict, and any future consumer agree.
 *
 * No LLM: `OPENROUTER_API_KEY` is unset in this deployment (see the batch
 * brief's "Design decisions" section), so this is deliberately a plain
 * lookup plus a couple of cheap, high-precision heuristics -- fully
 * unit-testable with no network and no API key.
 *
 * `null` means "not recognised as a platform -- treat it as a real
 * competitor," never "unknown." A domain this classifier has never heard of
 * defaults to being a candidate rival, exactly as it was before this batch;
 * classification only ever REMOVES a row from "real competitor," it never
 * requires a domain to prove itself onto that list.
 */

/**
 * Registrable domain (eTLD+1, lowercase) -> category. Keyed on the
 * registrable domain (not a bare brand name) so lookups are a single exact
 * match with no substring/contains risk -- "facebook-marketing-agency.com"
 * must never match "facebook.com".
 *
 * Covers the batch brief's own "at minimum" list. Not exhaustive by design:
 * a static list never can be, and a false negative here (a platform this
 * list doesn't know about) is the same failure mode the table already had
 * before this batch, not a regression -- whereas a false positive (wrongly
 * demoting a real competitor) would hide a genuine rival, so entries are
 * only added when the domain is unambiguously a platform/aggregator rather
 * than an operating business, and ccTLD variants are handled by normalizing
 * to eTLD+1 rather than by enumerating every country domain.
 */
const DOMAIN_CATEGORIES: Readonly<Record<string, CompetitorCategory>> = {
  // social
  "facebook.com": "social",
  "instagram.com": "social",
  "tiktok.com": "social",
  "twitter.com": "social",
  "x.com": "social",
  "linkedin.com": "social",
  "pinterest.com": "social",
  // Reddit reads as a social network/community platform in every major
  // categorization service (Similarweb, Semrush) rather than a narrow Q&A
  // site -- qa_forum is reserved for direct question-answering products
  // (Quora) below.
  "reddit.com": "social",

  // video
  "youtube.com": "video",

  // marketplace
  "amazon.com": "marketplace",
  "ebay.com": "marketplace",
  "walmart.com": "marketplace",
  "etsy.com": "marketplace",
  "alibaba.com": "marketplace",

  // directory
  "yelp.com": "directory",
  "yellowpages.com": "directory",
  "bbb.org": "directory",
  "mapquest.com": "directory",
  "tripadvisor.com": "directory",
  "angi.com": "directory",
  "thumbtack.com": "directory",
  "franchisedirect.com": "directory",
  // Job/employer-review directories: a listing service, not a business
  // competing for the client's own customers.
  "indeed.com": "directory",
  "glassdoor.com": "directory",

  // qa_forum
  "quora.com": "qa_forum",

  // search_engine
  "google.com": "search_engine",
  "bing.com": "search_engine",

  // education / reference
  "wikipedia.org": "education",

  // news -- "the obvious" mainstream outlets, deliberately not an attempt at
  // an exhaustive press list.
  "cnn.com": "news",
  "nytimes.com": "news",
  "forbes.com": "news",
  "bbc.com": "news",
  "bbc.co.uk": "news",
  "reuters.com": "news",
  "bloomberg.com": "news",
  "usatoday.com": "news",
  "washingtonpost.com": "news",
  "wsj.com": "news",
  "npr.org": "news",
  "businessinsider.com": "news",
};

/**
 * `.edu` and Commonwealth academic ccTLDs (`.ac.uk`, `.ac.jp`, ...). A cheap,
 * high-precision heuristic that covers "education" without enumerating every
 * university on earth -- these suffixes are gated, so a false positive would
 * require registering as an accredited institution, not just choosing a
 * domain name.
 */
const EDUCATIONAL_SUFFIX = /\.edu$|\.edu\.[a-z]{2,3}$|\.ac\.[a-z]{2,3}$/;

export function classifyCompetitorDomain(
  domain: string,
): CompetitorCategory | null {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return null;

  // Collapses any subdomain (m.facebook.com, en.wikipedia.org,
  // news.google.com) down to the registrable domain the static list and the
  // TLD heuristic below are both keyed on -- the same tldts helper
  // domainUtils.ts already depends on, not a new dependency. Cheap and
  // general: it handles the brief's own m.facebook.com/en.wikipedia.org
  // examples without a per-prefix list entry for either.
  const registrable = getDomain(normalized) ?? normalized;

  const listed = DOMAIN_CATEGORIES[registrable];
  if (listed) return listed;

  if (EDUCATIONAL_SUFFIX.test(registrable)) return "education";

  return null;
}
