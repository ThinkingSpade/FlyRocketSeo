// Pure data shaping for the top-pages treemap (no I/O), split out so the
// bucketing is unit-testable.

type PageRowInput = {
  page: string;
  relativePath: string | null;
  organicTraffic: number | null;
};

export type TreemapDatum = {
  name: string;
  traffic: number;
  /** Share of the summed traffic in the treemap, 0..1. */
  share: number;
  isOther: boolean;
};

const MAX_LEAVES = 11;
/** Below this many pages a treemap reads worse than the table itself. */
const MIN_PAGES = 3;

function labelFor(row: PageRowInput): string {
  const path = row.relativePath ?? row.page;
  return path === "" || path === "/" ? "/ (homepage)" : path;
}

/**
 * Top pages by estimated traffic plus an "other" bucket for the remainder
 * of the loaded rows. Empty when there aren't enough traffic-bearing pages
 * for areas to mean anything.
 */
export function buildPagesTreemapData(rows: PageRowInput[]): TreemapDatum[] {
  const withTraffic = rows
    .filter((row) => (row.organicTraffic ?? 0) > 0)
    .toSorted((a, b) => (b.organicTraffic ?? 0) - (a.organicTraffic ?? 0));
  if (withTraffic.length < MIN_PAGES) return [];

  const leaves = withTraffic.slice(0, MAX_LEAVES);
  const rest = withTraffic.slice(MAX_LEAVES);
  const restTraffic = rest.reduce(
    (sum, row) => sum + (row.organicTraffic ?? 0),
    0,
  );

  const data: TreemapDatum[] = leaves.map((row) => ({
    name: labelFor(row),
    traffic: row.organicTraffic ?? 0,
    share: 0,
    isOther: false,
  }));
  if (restTraffic > 0) {
    data.push({
      name: `${rest.length} more pages`,
      traffic: restTraffic,
      share: 0,
      isOther: true,
    });
  }

  const total = data.reduce((sum, datum) => sum + datum.traffic, 0);
  return data.map((datum) => ({
    ...datum,
    share: total > 0 ? datum.traffic / total : 0,
  }));
}
