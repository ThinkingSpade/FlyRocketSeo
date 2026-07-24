import type { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";

export type ProjectGscReport = Extract<
  Awaited<ReturnType<typeof getSearchPerformanceReport>>,
  { connected: true }
>;

export function isProjectGscReport(
  value:
    | Awaited<ReturnType<typeof getSearchPerformanceReport>>
    | null
    | undefined,
): value is ProjectGscReport {
  return value?.connected === true;
}

export type TopicCoverage = {
  status: "covered" | "missing" | "cannibalized";
  pageCount: number;
  pages: string[];
};

export type LocalLandingPage = {
  page: string;
  clicks: number;
  impressions: number;
};

const QUESTION_PREFIX =
  /^(?:what|which|who|where|when|why|how|is|are|can|does|do|should)\b/i;
const LOCAL_QUERY_PATTERN = /\b(?:near me|nearby|local|in my area)\b/i;
const LOCAL_PATH_PATTERN =
  /\/(?:locations?|service-areas?|areas-served|cities|city|local)(?:\/|$)/i;

export function normalizeSearchPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^sc-domain:/, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function domainStem(value: string | null | undefined): string | null {
  const normalized = normalizeSearchPhrase(value ?? "");
  const stem = normalized.split(/[.\s]/)[0];
  return stem || null;
}

function phrasesOverlap(left: string, right: string): boolean {
  const a = normalizeSearchPhrase(left);
  const b = normalizeSearchPhrase(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.split(" ").length >= 2 && longer.includes(shorter);
}

export function getTopicCoverage(
  report: ProjectGscReport,
  terms: string[],
): TopicCoverage {
  const pages = new Set<string>();
  for (const row of report.queryPages) {
    if (terms.some((term) => phrasesOverlap(term, row.query))) {
      pages.add(row.page);
    }
  }
  const pageList = [...pages];
  return {
    status:
      pageList.length === 0
        ? "missing"
        : pageList.length === 1
          ? "covered"
          : "cannibalized",
    pageCount: pageList.length,
    pages: pageList,
  };
}

function landingTopic(page: string): string | null {
  try {
    const segments = new URL(page).pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment).replace(/[-_]+/g, " "));
    const topic = segments.at(-1)?.trim();
    if (!topic || /^(?:index|home|blog|pages?)$/i.test(topic)) return null;
    return topic;
  } catch {
    return null;
  }
}

function questionForTopic(topic: string, index: number): string {
  const cleaned = topic.trim().replace(/[?.!]+$/, "");
  if (QUESTION_PREFIX.test(cleaned)) {
    return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}?`;
  }
  const templates = [
    (value: string) => `What are the best options for ${value}?`,
    (value: string) => `How do I choose ${value}?`,
    (value: string) => `What should I know before using ${value}?`,
  ];
  return templates[index % templates.length]?.(cleaned) ?? cleaned;
}

export function buildPromptStarters(report: ProjectGscReport): string[] {
  const topics = [
    ...report.queryTotals
      .toSorted((a, b) => b.impressions - a.impressions)
      .map((row) => row.query),
    ...report.queryPages.map((row) => landingTopic(row.page)).filter(Boolean),
  ];
  const uniqueTopics = [
    ...new Map(
      topics
        .filter((topic): topic is string => Boolean(topic?.trim()))
        .map((topic) => [normalizeSearchPhrase(topic), topic]),
    ).values(),
  ];
  if (uniqueTopics.length === 0) return [];

  const starters: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const topic = uniqueTopics[index % uniqueTopics.length];
    if (!topic) break;
    const starter = questionForTopic(topic, index);
    if (!starters.includes(starter)) starters.push(starter);
  }
  return starters.slice(0, 6);
}

export function getBrandedQueries(
  report: ProjectGscReport,
  brandCandidates: Array<string | null | undefined>,
) {
  const brands = brandCandidates
    .map((candidate) => normalizeSearchPhrase(candidate ?? ""))
    .filter((candidate) => candidate.length >= 3);
  if (brands.length === 0) return [];
  return report.queryTotals
    .filter((row) => {
      const query = normalizeSearchPhrase(row.query);
      return brands.some((brand) => query.includes(brand));
    })
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
}

export function getLocalLandingPages(
  report: ProjectGscReport,
  locationCandidates: Array<string | null | undefined>,
): LocalLandingPage[] {
  const locations = locationCandidates
    .map((candidate) => normalizeSearchPhrase(candidate ?? ""))
    .filter(Boolean);
  const byPage = new Map<string, LocalLandingPage>();
  for (const row of report.queryPages) {
    const query = normalizeSearchPhrase(row.query);
    const isLocal =
      LOCAL_QUERY_PATTERN.test(row.query) ||
      LOCAL_PATH_PATTERN.test(row.page) ||
      locations.some((location) => query.includes(location));
    if (!isLocal) continue;
    const current = byPage.get(row.page) ?? {
      page: row.page,
      clicks: 0,
      impressions: 0,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    byPage.set(row.page, current);
  }
  return [...byPage.values()]
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
}
