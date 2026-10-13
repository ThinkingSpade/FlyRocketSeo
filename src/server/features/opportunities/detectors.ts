import type {
  EvidenceSnapshot,
  EvidenceWindow,
  OpportunityFinding,
  OpportunityResult,
} from "@/shared/opportunities";
import { pacificCalendarDate } from "@/server/features/gsc/searchAnalytics";

const DAY = 86_400_000;
const seasonality =
  "Seasonality, search changes and concurrent work have not been controlled; this is evidence to investigate, not an identified cause.";

function dateDays(window: EvidenceWindow): number {
  return (Date.parse(window.endDate) - Date.parse(window.startDate)) / DAY + 1;
}

export function matchingWeekdays(
  a: EvidenceWindow,
  b: EvidenceWindow,
): boolean {
  const days = dateDays(a);
  return (
    days > 0 &&
    days === dateDays(b) &&
    (days % 7 === 0 ||
      new Date(a.startDate).getUTCDay() === new Date(b.startDate).getUTCDay())
  );
}

function validObservation(row: EvidenceSnapshot["current"]): boolean {
  return (
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions >= row.clicks &&
    (row.position === null ||
      (Number.isFinite(row.position) && row.position > 0))
  );
}

function hasCompleteEvidence(evidence: EvidenceSnapshot): boolean {
  return (
    evidence.coverage.finalData &&
    evidence.coverage.complete &&
    !evidence.coverage.truncated &&
    validObservation(evidence.current) &&
    validObservation(evidence.previous)
  );
}

/** Ordered bands deliberately describe supported exposure, not a predicted gain. */
export function detectDecliningPages(
  evidence: EvidenceSnapshot[],
): OpportunityFinding[] {
  const findings = new Map<string, OpportunityFinding>();
  for (const snapshot of evidence) {
    if (
      !hasCompleteEvidence(snapshot) ||
      !matchingWeekdays(snapshot.window, snapshot.previousWindow) ||
      snapshot.previous.clicks < 20 ||
      snapshot.previous.impressions < 100 ||
      snapshot.previous.clicks - snapshot.current.clicks < 10 ||
      snapshot.current.clicks > snapshot.previous.clicks * 0.8
    )
      continue;
    // An absent row in a top-row pull cannot prove a fall to zero.
    if (
      snapshot.coverage.currentRows === 0 ||
      snapshot.coverage.previousRows === 0
    )
      continue;
    const loss = snapshot.previous.clicks - snapshot.current.clicks;
    const limitations = [...snapshot.limitations, seasonality];
    findings.set(JSON.stringify([snapshot.scope, snapshot.url]), {
      kind: "page_decline",
      title: "Investigate declining page clicks",
      finding: `Observed ${snapshot.current.clicks} clicks compared with ${snapshot.previous.clicks} in the equal previous window (${loss} fewer).`,
      url: snapshot.url,
      assetRefs: [snapshot.url],
      priorityBand: loss >= 100 ? "high" : "medium",
      confidenceBand: "medium",
      limitations,
      nextSteps: [
        "Inspect the exact page and query comparison.",
        "Review captured content and technical evidence before choosing a change.",
      ],
      evidence: { ...snapshot, limitations },
    });
  }
  return [...findings.values()].toSorted(
    (a, b) =>
      b.evidence.previous.clicks -
        b.evidence.current.clicks -
        (a.evidence.previous.clicks - a.evidence.current.clicks) ||
      a.url.localeCompare(b.url),
  );
}

/** A comparable before/after observation remains association, not causation. */
export function compareOpportunityEvidence(
  baseline: EvidenceSnapshot,
  after: EvidenceSnapshot,
  implementedAt: string,
): Pick<
  OpportunityResult,
  "availability" | "clicksChange" | "impressionsChange" | "limitations"
> {
  const limitations = [
    seasonality,
    "Implementation is reported by a user; this comparison does not verify the website change.",
  ];
  const scopeFields = [
    "organizationId",
    "projectId",
    "target",
    "siteUrl",
    "connectedBy",
    "country",
    "device",
    "searchType",
  ] as const;
  const sameScope = scopeFields.every(
    (key) => baseline.scope[key] === after.scope[key],
  );
  const implemented = Date.parse(implementedAt);
  const implementationDay = Number.isFinite(implemented)
    ? pacificCalendarDate(new Date(implemented)).getTime()
    : NaN;
  const baselineEnd = Date.parse(baseline.window.endDate) + DAY;
  const afterStart = Date.parse(after.window.startDate);
  const observationStart = implementationDay + 7 * DAY;
  if (
    !sameScope ||
    baseline.url !== after.url ||
    !Number.isFinite(implemented) ||
    implementationDay < baselineEnd ||
    afterStart < observationStart ||
    !matchingWeekdays(baseline.window, after.window)
  ) {
    return {
      availability: "incomparable",
      clicksChange: null,
      impressionsChange: null,
      limitations: [
        ...limitations,
        "Keep the same property, connector, website, page, market, device and search type; use equal weekday windows after a seven-day observation lag.",
      ],
    };
  }
  if (
    !hasCompleteEvidence(baseline) ||
    !hasCompleteEvidence(after) ||
    baseline.current.impressions < 100 ||
    after.current.impressions < 100 ||
    baseline.coverage.currentRows === 0 ||
    after.coverage.currentRows === 0
  ) {
    return {
      availability: "insufficient",
      clicksChange: null,
      impressionsChange: null,
      limitations: [
        ...limitations,
        "Incomplete or low-volume observations need more evidence; a missing page is not zero benefit.",
      ],
    };
  }
  return {
    availability: "measured",
    clicksChange: after.current.clicks - baseline.current.clicks,
    impressionsChange: after.current.impressions - baseline.current.impressions,
    limitations,
  };
}

export type InternalLinkInput = {
  evidence: EvidenceSnapshot;
  phrase: string;
  destination: { url: string; impressions: number; position: number };
  source: {
    url: string;
    statusCode: number;
    capturedAt: string;
    links?: string[];
    locations: { location: string; text: string }[];
  };
};

export function detectInternalLink(
  input: InternalLinkInput,
): OpportunityFinding | null {
  const { source, destination, evidence } = input;
  const phrase = input.phrase.trim().replace(/\s+/g, " ");
  if (
    !phrase ||
    source.statusCode !== 200 ||
    !source.links ||
    source.url === destination.url ||
    destination.impressions < 100 ||
    !Number.isFinite(destination.position) ||
    destination.position < 4 ||
    destination.position > 20 ||
    !hasCompleteEvidence(evidence)
  )
    return null;
  const destinationUrl = new URL(destination.url);
  destinationUrl.hash = "";
  if (
    source.links.some((link) => {
      try {
        const url = new URL(link, source.url);
        url.hash = "";
        return url.href === destinationUrl.href;
      } catch {
        return false;
      }
    })
  )
    return null;
  const location = source.locations.find((part) =>
    part.text.toLowerCase().includes(phrase.toLowerCase()),
  );
  if (!location) return null;
  const limitations = [
    ...evidence.limitations,
    "Captured HTML is not rendered JavaScript content. Recheck the source before implementing; a relevant query does not guarantee ranking gains.",
  ];
  return {
    kind: "internal_link",
    title: "Review a contextual internal link",
    finding: `Captured source text mentions “${phrase}” and its captured links do not include the destination.`,
    url: source.url,
    assetRefs: [source.url, destination.url],
    priorityBand: "medium",
    confidenceBand: "medium",
    limitations,
    nextSteps: [
      "Check the captured paragraph and destination relevance.",
      "Review and add the proposed link manually if it serves the reader.",
    ],
    evidence: {
      ...evidence,
      source: "Google Search Console and captured HTML",
      limitations,
      link: {
        sourceUrl: source.url,
        destinationUrl: destination.url,
        anchor: phrase,
        sourceLocation: location.location,
        sourceExcerpt: location.text.slice(0, 500),
        capturedAt: source.capturedAt,
      },
    },
  };
}
