import type { BrandLookupResult } from "@/types/schemas/ai-search";

/**
 * Pure shaping of a Brand Lookup result into the denormalized fields we store
 * as a daily snapshot. Split out so the extraction is unit-testable without a
 * database, and so the repository stays a thin persistence layer.
 *
 * The headline columns (`totalMentions`, per-platform, `targetSharePct`) exist
 * to make trend queries cheap; `resultJson` carries the whole shaped result so
 * the report and opportunities can render richly without re-charging a lookup.
 */
export type SnapshotFields = {
  target: string;
  capturedOn: string;
  totalMentions: number | null;
  chatgptMentions: number | null;
  googleMentions: number | null;
  targetSharePct: number | null;
  resultJson: string;
};

function platformMentions(
  result: BrandLookupResult,
  platform: "chat_gpt" | "google",
): number | null {
  const row = result.perPlatform.find((entry) => entry.platform === platform);
  return row?.mentions ?? null;
}

// The report shows the top 5 cited pages and opportunities read the top few
// queries, so these caps keep everything they need while bounding the stored
// row well under D1's ~2 MB per-row limit (schema maxima alone can approach it).
const STORED_TOP_PAGES = 15;
const STORED_TOP_QUERIES = 20;

/** Trim the heavy arrays before storage; consumers never need the full lists. */
function trimForStorage(result: BrandLookupResult): BrandLookupResult {
  return {
    ...result,
    topPages: result.topPages.slice(0, STORED_TOP_PAGES),
    topQueries: result.topQueries.slice(0, STORED_TOP_QUERIES),
  };
}

/** Extract the stored fields for one snapshot from a shaped lookup result. */
export function snapshotFromResult(
  result: BrandLookupResult,
  capturedOn: string,
): SnapshotFields {
  const targetEntry = result.shareOfVoice?.entries.find(
    (entry) => entry.isTarget,
  );
  return {
    target: result.resolvedTarget,
    capturedOn,
    totalMentions: result.totalMentions,
    chatgptMentions: platformMentions(result, "chat_gpt"),
    googleMentions: platformMentions(result, "google"),
    targetSharePct: targetEntry?.sharePct ?? null,
    resultJson: JSON.stringify(trimForStorage(result)),
  };
}
