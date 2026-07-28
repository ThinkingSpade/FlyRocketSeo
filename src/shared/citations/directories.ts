/**
 * The major citation sources the Citation Tracker checks for.
 *
 * BrightLocal's citation audit works because it owns a curated index of
 * dozens of directories with known NAP fields. We have no such dataset, and
 * DataForSEO's Business Listings API is not a directory index either — it
 * sources from Google Maps/GMB, Trustpilot and Tripadvisor, not a crawl of
 * the directories below. So this table is the other half of that trade: a
 * short, hand-verified list of directories worth searching for by name, kept
 * deliberately short rather than padded with sites we merely suspect exist.
 * See citationModel.ts for how a search result gets matched against a row
 * here, and the Citation Tracker service for how the search itself runs.
 *
 * Small enough to bundle as a plain array, unlike src/shared/geo: that
 * module's actual long tail (every city/metro worldwide) is tens of
 * thousands of rows and lives in the geo_locations D1 table, searched on
 * demand (see GeoLocationRepository) — only a curated common subset
 * (US_DMAS/US_STATES) ships as a bundled array. Citation directories have no
 * such long tail to defer: the whole point of this feature is a short,
 * curated majors list, so a few dozen rows is the entire dataset, not a
 * fast-path subset of a bigger one.
 *
 * Deliberately left out despite being well-known "citation" names, and why:
 * - Google Business Profile / Google Maps: this is the business's own
 *   listing, already covered by the GBP Audit elsewhere in Local SEO — not
 *   a third-party citation to discover.
 * - Instagram / X (Twitter): social profiles, but neither reliably renders
 *   structured NAP (address/phone) the way a directory listing does, so a
 *   "match" here wouldn't actually evidence a citation.
 * - Citysearch, MerchantCircle, EZlocal, Local.com, Brownbook, Cylex,
 *   Tupalo, Yellowbot: long-tail directories with uncertain current
 *   ownership/domain stability at the time this list was written. A wrong
 *   entry produces a permanent false "missing citation" nag, so left out
 *   rather than guessed.
 */

export type DirectoryCategory = "general" | "social" | "review" | "industry";

export type DirectoryEntry = {
  /** Stable identifier for React keys and the missing/found lists — never
   *  the display name, so relabeling a directory can't change its identity. */
  id: string;
  name: string;
  /** Canonical domain, no protocol or "www." — matched against SERP result
   *  domains by citationModel.ts. */
  domain: string;
  /** Confident alternate domains for the same directory (country-TLD
   *  variants, mainly). Left empty rather than guessed when unsure — see
   *  the file comment above. */
  aliases?: string[];
  category: DirectoryCategory;
};

export const DIRECTORIES: readonly DirectoryEntry[] = [
  // General business directories
  {
    id: "yellow-pages",
    name: "Yellow Pages",
    domain: "yellowpages.com",
    category: "general",
  },
  { id: "manta", name: "Manta", domain: "manta.com", category: "general" },
  {
    id: "hotfrog",
    name: "Hotfrog",
    domain: "hotfrog.com",
    category: "general",
  },
  {
    id: "chamber-of-commerce",
    name: "Chamber of Commerce",
    domain: "chamberofcommerce.com",
    category: "general",
  },
  {
    id: "superpages",
    name: "Superpages",
    domain: "superpages.com",
    category: "general",
  },
  {
    id: "mapquest",
    name: "MapQuest",
    domain: "mapquest.com",
    category: "general",
  },
  {
    id: "apple-maps",
    name: "Apple Maps",
    domain: "maps.apple.com",
    category: "general",
  },
  {
    id: "bing-places",
    name: "Bing Places",
    domain: "bingplaces.com",
    category: "general",
  },

  // Social platforms that also carry a business's NAP details
  {
    id: "facebook",
    name: "Facebook",
    domain: "facebook.com",
    category: "social",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    domain: "linkedin.com",
    category: "social",
  },
  {
    id: "nextdoor",
    name: "Nextdoor",
    domain: "nextdoor.com",
    category: "social",
  },
  {
    id: "foursquare",
    name: "Foursquare",
    domain: "foursquare.com",
    category: "social",
  },

  // Review platforms
  {
    id: "yelp",
    name: "Yelp",
    domain: "yelp.com",
    // Yelp's UK property — a confident, verified country variant, not a
    // guess (see the file comment's rule on why most variants are omitted).
    aliases: ["yelp.co.uk"],
    category: "review",
  },
  {
    id: "bbb",
    name: "Better Business Bureau",
    domain: "bbb.org",
    category: "review",
  },
  {
    id: "trustpilot",
    name: "Trustpilot",
    domain: "trustpilot.com",
    category: "review",
  },
  {
    id: "tripadvisor",
    name: "Tripadvisor",
    domain: "tripadvisor.com",
    category: "review",
  },

  // Industry-specific directories
  { id: "angi", name: "Angi", domain: "angi.com", category: "industry" },
  {
    id: "thumbtack",
    name: "Thumbtack",
    domain: "thumbtack.com",
    category: "industry",
  },
  { id: "houzz", name: "Houzz", domain: "houzz.com", category: "industry" },
];
