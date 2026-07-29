/**
 * Measure the CPU cost of aggregating a GSC query x page payload, to justify
 * GSC_ANALYTICS_ROW_CEILING against the Cloudflare Workers CPU budget instead
 * of guessing at it.
 *
 * This measures the REAL functions that run on the request path, not a
 * reimplementation, so the numbers mean something. All four run per Search
 * Performance request today (see serverFunctions/searchPerformance.ts), so the
 * per-size total is what one page view actually costs.
 *
 * Workers Free allows 10ms CPU per invocation; Workers Paid allows far more.
 * The aggregation shares that budget with routing, auth, JSON parsing and
 * response serialization, so treat anything close to the limit as over it.
 *
 * Run: npx tsx scripts/measure-gsc-aggregation.ts
 */
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import {
  buildCtrOpportunityRows,
  buildQueryTotals,
  buildStrikingDistanceRows,
  toQueryPageRows,
} from "@/server/features/gsc/searchPerformanceReport";

const SIZES = [1000, 2500, 5000, 10_000, 25_000];
const REPEATS = 5;

/**
 * Realistic query x page fan-out: each query surfaces across a few pages, and
 * positions spread across the full 1..100 range so the 5..20 striking-distance
 * band filter does real work rather than rejecting everything up front.
 */
function syntheticRows(count: number): GscSearchAnalyticsRow[] {
  const rows: GscSearchAnalyticsRow[] = [];
  const queryCount = Math.max(1, Math.floor(count / 3));
  for (let i = 0; i < count; i++) {
    const impressions = (i % 991) + 1;
    const clicks = i % 7 === 0 ? 0 : i % 23;
    rows.push({
      keys: [
        `seo keyword phrase ${i % queryCount}`,
        `https://example.com/page-${i % 400}`,
      ],
      clicks,
      impressions,
      ctr: clicks / impressions,
      position: 1 + ((i * 7) % 100),
    });
  }
  return rows;
}

function timeAggregate(rows: GscSearchAnalyticsRow[]): number {
  const start = performance.now();
  buildQueryTotals(rows);
  buildStrikingDistanceRows(rows);
  buildCtrOpportunityRows(rows);
  toQueryPageRows(rows);
  return performance.now() - start;
}

/** The rows do not arrive as objects. Parsing the provider response is CPU on
 *  the same invocation, so a ceiling justified on aggregation alone is wrong. */
function timeParse(payload: string): number {
  const start = performance.now();
  JSON.parse(payload);
  return performance.now() - start;
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

console.log(
  "rows      MB   parse ms   aggregate ms   total ms   vs 10ms Free budget",
);
console.log(
  "------  ----   --------   ------------   --------   -------------------",
);

for (const size of SIZES) {
  const rows = syntheticRows(size);
  const payload = JSON.stringify({ rows });
  const megabytes = payload.length / 1_000_000;

  timeAggregate(rows); // warm-up, so JIT cost is not attributed to size
  timeParse(payload);

  const aggregateSamples: number[] = [];
  const parseSamples: number[] = [];
  for (let r = 0; r < REPEATS; r++) {
    aggregateSamples.push(timeAggregate(rows));
    parseSamples.push(timeParse(payload));
  }

  const aggregateMs = median(aggregateSamples);
  const parseMs = median(parseSamples);
  const totalMs = aggregateMs + parseMs;
  const verdict =
    totalMs >= 10
      ? "OVER budget"
      : totalMs >= 5
        ? "over half -- too tight"
        : "fits";

  console.log(
    `${String(size).padStart(6)}  ${megabytes.toFixed(1).padStart(4)}   ` +
      `${parseMs.toFixed(2).padStart(8)}   ${aggregateMs.toFixed(2).padStart(12)}   ` +
      `${totalMs.toFixed(2).padStart(8)}   ${verdict}`,
  );
}

console.log(
  "\nNote: a dev machine is faster than a Workers isolate, and this still\n" +
    "excludes routing, auth, D1 round trips and response serialization.\n" +
    "Treat these as a LOWER BOUND on real CPU cost, not a pass certificate.",
);
