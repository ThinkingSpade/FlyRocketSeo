import {
  isCompetitorRow,
  type CompetitorRow,
} from "@/types/schemas/competitors";

type GroupedCompetitorRows = {
  /** Real rivals -- unclassified rows, plus anything pinned regardless of
   *  classification (decision 4: a user pin always wins). */
  competitors: CompetitorRow[];
  /** Platforms/aggregators the classifier recognised and that are not
   *  pinned. Never dropped -- only moved into a separate, disclosed group
   *  (see CompetitorsDiscoveryNotice's "N domains hidden" for the existing
   *  precedent this follows). */
  notCompetitors: CompetitorRow[];
};

/**
 * The presentation-layer "re-ranking" this batch adds: splits an already
 * server-ranked row list into real competitors and demoted platforms,
 * WITHOUT re-sorting either group -- a stable partition, not a fresh sort.
 *
 * Storage and the server's own ranking are untouched by classification (see
 * decision 3 in the batch brief: "Classification is advisory data, not a
 * filter applied server-side before storage"); this is the one place that
 * advisory data actually changes what the user sees, and it does so only at
 * render time, by grouping rows the server already ordered by
 * beatsYouCount/coverage.
 */
export function groupCompetitorRows(
  rows: CompetitorRow[],
): GroupedCompetitorRows {
  const competitors: CompetitorRow[] = [];
  const notCompetitors: CompetitorRow[] = [];

  for (const row of rows) {
    (isCompetitorRow(row) ? competitors : notCompetitors).push(row);
  }

  return { competitors, notCompetitors };
}
