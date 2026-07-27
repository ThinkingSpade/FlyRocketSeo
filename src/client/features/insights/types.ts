import type { LinkOptions } from "@tanstack/react-router";

/**
 * Shared vocabulary for the insights layer.
 *
 * Everything here is computed from data the app has already fetched. No type
 * in this file may carry a value that required a metered call to obtain.
 */

/** A prefill candidate, always carrying the number that justifies it. */
export type SeedSuggestion = {
  /** The keyword, domain, or URL to put in the field. */
  value: string;
  /** "pos 7 · 2.4k impr" — shown beside the value, never omitted. */
  hint: string;
  /** Higher sorts first. Units differ per intent; only order matters. */
  weight: number;
};

export type SuggestionIntent =
  | "striking-distance"
  | "under-clicked"
  | "high-volume"
  | "topic-gap"
  | "own-pages";

/**
 * Search Console query×page row, as returned by getSearchPerformanceReport.
 * `ctr` is optional: the `queryPages` field (toQueryPageRows) never carries it
 * through, only `ctrOpportunities` rows (buildCtrOpportunityRows) do — the two
 * share this shape but not this one field.
 */
export type GscQueryPage = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
};

export type GscQueryTotal = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type GscStrikingDistance = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type GscCtrOpportunity = GscQueryPage & { missedClicks: number };

export type SavedKeyword = {
  keyword: string;
  searchVolume: number | null;
};

/**
 * Everything the suggestion model is allowed to read. Adding a field here is
 * a design change: each one must come from a source that is free and already
 * cached. See the spec's free-data contract.
 */
export type FreeSignals = {
  queryTotals: GscQueryTotal[];
  queryPages: GscQueryPage[];
  strikingDistance: GscStrikingDistance[];
  ctrOpportunities: GscCtrOpportunity[];
  savedKeywords: SavedKeyword[];
};

export type VerdictTone = "good" | "mixed" | "bad" | "unknown";

export type Action = {
  /** Imperative and specific. "Rewrite the title on /coffee-water". */
  label: string;
  /** The number that justifies it. "1,240 impressions at 0.4% CTR". */
  evidence: string;
  /** Where the work happens, as typed router link options. */
  to?: LinkOptions;
  /** Ranked by this, descending. Clicks where derivable, else a fixed tier. */
  weight: number;
};

export type Verdict = {
  /** One sentence stating what the data says. Not advice. */
  read: string;
  tone: VerdictTone;
  actions: Action[];
};

/** The empty verdict, for results too thin to interpret honestly. */
export function unknownVerdict(read: string): Verdict {
  return { read, tone: "unknown", actions: [] };
}
