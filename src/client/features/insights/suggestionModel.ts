import { isBrandSeed } from "@/client/features/search-performance/brandedSplit";
import type { FreeSignals, SeedSuggestion, SuggestionIntent } from "./types";

/**
 * Ranks prefill candidates from data the app already holds.
 *
 * Every input arrives via `FreeSignals`, whose sources are all free and all
 * already cached — so nothing here can cost money or add a request. The model
 * is pure so the ranking stays unit-testable and the hook above it stays thin.
 *
 * Each intent answers a different question, because the keyword worth
 * prefilling into "should I chase this SERP?" is not the one worth prefilling
 * into "which page should I rewrite?".
 */

const DEFAULT_LIMIT = 5;

/** Below this, a query has too little demand for any advice to be meaningful. */
const MIN_IMPRESSIONS = 10;

// Striking distance: close enough that ranking work pays, far enough that
// there is something to win. Matches the band the Opportunities tab uses.
const STRIKING_MIN_POSITION = 4;
const STRIKING_MAX_POSITION = 20;

/** Past this, the site has no real foothold for the query — it is a gap. */
const TOPIC_GAP_MIN_POSITION = 21;

export function compactNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function byWeightDesc(a: SeedSuggestion, b: SeedSuggestion): number {
  // Demotion beats weight: a branded query outweighs everything on impressions
  // and would otherwise always take the top slot.
  if (Boolean(a.demoted) !== Boolean(b.demoted)) return a.demoted ? 1 : -1;
  return b.weight - a.weight;
}

function strikingDistance(signals: FreeSignals): SeedSuggestion[] {
  return signals.strikingDistance
    .filter(
      (row) =>
        row.position >= STRIKING_MIN_POSITION &&
        row.position <= STRIKING_MAX_POSITION &&
        row.impressions >= MIN_IMPRESSIONS,
    )
    .map((row) => ({
      value: row.query,
      hint: `pos ${Math.round(row.position)} · ${compactNumber(row.impressions)} impr`,
      weight: row.impressions,
    }));
}

function underClicked(signals: FreeSignals): SeedSuggestion[] {
  return signals.ctrOpportunities
    .filter((row) => row.impressions >= MIN_IMPRESSIONS)
    .map((row) => ({
      value: row.query,
      hint: `${compactNumber(row.missedClicks)} clicks missed · pos ${Math.round(row.position)}`,
      weight: row.missedClicks,
    }));
}

function highVolume(signals: FreeSignals): SeedSuggestion[] {
  // Saved keywords carry real search volume, which is a better signal than
  // impressions; they only lose when the user has saved nothing with a volume.
  const saved = signals.savedKeywords
    .filter((row) => row.searchVolume != null && row.searchVolume > 0)
    .map((row) => ({
      value: row.keyword,
      hint: `${compactNumber(row.searchVolume ?? 0)}/mo saved`,
      weight: row.searchVolume ?? 0,
    }));
  if (saved.length > 0) return saved;

  // Impressions alone always float the brand to the top, so branded queries
  // are demoted rather than dropped — seeding your own name is a valid choice,
  // just never the default one.
  return signals.queryTotals
    .filter((row) => row.impressions >= MIN_IMPRESSIONS)
    .map((row) => ({
      value: row.query,
      hint: `${compactNumber(row.impressions)} impr · pos ${Math.round(row.position)}`,
      weight: row.impressions,
      // Set only when true, so a project with no brand terms produces exactly
      // the suggestion objects it did before.
      ...(isBrandSeed(row.query, row.position, signals.brandTerms)
        ? { demoted: true }
        : {}),
    }));
}

function topicGap(signals: FreeSignals): SeedSuggestion[] {
  // Demand exists (impressions) but the site has no page near the top for it —
  // exactly the shape a new hub or cluster is meant to fill.
  return signals.queryTotals
    .filter(
      (row) =>
        row.impressions >= MIN_IMPRESSIONS &&
        row.position >= TOPIC_GAP_MIN_POSITION,
    )
    .map((row) => ({
      value: row.query,
      // "best page ranks #N" was true of the old page-summed totals, where
      // position was the minimum across a query's pages. These rows now carry
      // Google's own property-level average position for the query, so naming a
      // page would attribute it to a URL this row does not identify.
      hint: `${compactNumber(row.impressions)} impr · ranks #${Math.round(row.position)}`,
      weight: row.impressions,
    }));
}

function ownPages(signals: FreeSignals): SeedSuggestion[] {
  const clicksByPage = new Map<string, number>();
  for (const row of signals.queryPages) {
    clicksByPage.set(row.page, (clicksByPage.get(row.page) ?? 0) + row.clicks);
  }

  return [...clicksByPage.entries()].map(([page, clicks]) => ({
    value: page,
    hint: `${compactNumber(clicks)} clicks`,
    weight: clicks,
  }));
}

const BUILDERS: Record<
  SuggestionIntent,
  (signals: FreeSignals) => SeedSuggestion[]
> = {
  "striking-distance": strikingDistance,
  "under-clicked": underClicked,
  "high-volume": highVolume,
  "topic-gap": topicGap,
  "own-pages": ownPages,
};

export function buildSuggestions(
  signals: FreeSignals,
  intent: SuggestionIntent,
  limit: number = DEFAULT_LIMIT,
): SeedSuggestion[] {
  return BUILDERS[intent](signals).toSorted(byWeightDesc).slice(0, limit);
}
