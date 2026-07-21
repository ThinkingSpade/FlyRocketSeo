/**
 * Pure display helpers for the Client Report page — split from the component
 * so the formatting and recommendation rules are unit-testable.
 */

export function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPosition(value: number | null | undefined): string {
  if (value == null || value === 0) return "—";
  return value.toFixed(1);
}

/** Delta for "higher is better" metrics. Returns null when there is no
 *  meaningful comparison. */
export function delta(
  current: number,
  previous: number,
): { text: string; good: boolean } | null {
  const diff = current - previous;
  if (previous === 0 && current === 0) return null;
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${Math.round(diff).toLocaleString()}`,
    good: diff >= 0,
  };
}

/** Delta for average position, where LOWER is better; positive = improved. */
export function positionDelta(
  current: number,
  previous: number,
): { text: string; good: boolean } | null {
  if (current === 0 || previous === 0) return null;
  const improvement = previous - current;
  if (Math.abs(improvement) < 0.05) return null;
  const sign = improvement > 0 ? "+" : "";
  return { text: `${sign}${improvement.toFixed(1)}`, good: improvement > 0 };
}

type RecommendationInput = {
  strikingDistanceCount: number;
  cannibalizationCount: number;
  linkOpportunityCount: number;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  latestAuditAgeDays: number | null;
  latestAuditFailed: boolean;
};

/** Turn the report's findings into the "what we do next" bullets clients
 *  actually read. Ordered by impact. */
export function buildRecommendations(input: RecommendationInput): string[] {
  const recommendations: string[] = [];

  if (input.strikingDistanceCount > 0) {
    recommendations.push(
      `${input.strikingDistanceCount} keywords rank just off the top spots (positions 5–20). Strengthening these pages is the fastest path to more traffic.`,
    );
  }
  if (input.linkOpportunityCount > 0) {
    recommendations.push(
      `${input.linkOpportunityCount} internal-link opportunities found — adding links from related pages passes authority to the pages that are close to ranking.`,
    );
  }
  if (input.cannibalizationCount > 0) {
    recommendations.push(
      `${input.cannibalizationCount} keywords have multiple pages competing against each other. Consolidating each onto one page stops the ranking split.`,
    );
  }
  if (
    input.lostBacklinks != null &&
    input.newBacklinks != null &&
    input.lostBacklinks > input.newBacklinks
  ) {
    recommendations.push(
      `Backlink losses (${input.lostBacklinks.toLocaleString()}) outpaced gains (${input.newBacklinks.toLocaleString()}) recently — worth a link reclamation pass.`,
    );
  }
  if (input.latestAuditFailed || input.latestAuditAgeDays == null) {
    recommendations.push(
      "Run a fresh site audit to confirm technical health before the next content push.",
    );
  } else if (input.latestAuditAgeDays > 30) {
    recommendations.push(
      `The last site audit is ${input.latestAuditAgeDays} days old — re-run it to catch new technical issues.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "No urgent issues detected — keep publishing against the content plan and monitoring rankings.",
    );
  }
  return recommendations;
}

/** Display a URL as its path — report tables don't need the domain repeated. */
export function toPath(url: string | null): string {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
