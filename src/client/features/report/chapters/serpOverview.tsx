import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table } from "@cloudflare/kumo/components/table";
import type { z } from "zod";
import { getRecentRuns } from "@/serverFunctions/analysisRuns";
import { getProjects } from "@/serverFunctions/projects";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { serpOverviewSchema } from "@/types/schemas/serp";
import { parseRestoredSerpRunGeo } from "@/client/features/serp/serpRunGeo";
import { estimateTrafficShare } from "@/client/features/serp/serpTrafficShare";
import { LOCATIONS } from "@/shared/keyword-locations";
import { normalizeDomain } from "@/types/schemas/domain";
import {
  describeFailedReads,
  describeSnapshotGap,
} from "@/client/features/report/reportReads";
import { formatCount, toPath } from "@/client/features/report/reportModel";
import {
  useFreeRead,
  useVouchedKeywords,
} from "@/client/features/report/chapters/serpOverviewReads";
import { Section } from "@/client/features/report/ReportPrimitives";
import {
  ReportBreakdownCard,
  ReportCallout,
  ReportHeroStats,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import type { ChapterCollector } from "@/client/features/report/reportChapters";

/**
 * Chapter 04: the Google results page for ONE of the client's keywords, as it
 * stood on the day someone last looked it up.
 *
 * The whole chapter turns on a relevance gate. Only the newest SERP run
 * auto-restores, and its keyword is whatever an analyst last typed into the
 * SERP tab — frequently a competitor's brand or an exploratory query. Printing
 * "Who ranks for your keyword" above a competitor's brand name, in a PDF handed
 * to the client, is worse than leaving the sheet out. So a run prints only when
 * its keyword is one Search Console already shows this site for; when the
 * newest run fails that test the saved history is walked for one that passes.
 * Expect this chapter absent more often than present — an absence becomes a
 * coverage line, and that is the correct outcome.
 *
 * What that gate may NOT do is turn its own narrowness into a finding. It reads
 * a slice of Search Console, not all of it, so every sentence below says what
 * was checked rather than asserting what the site does or does not rank for.
 *
 * Every read here is free. `restoreLatestRun` / `getRecentRuns` / `restoreRun`
 * read a stored row plus an R2 object the run already paid for, and the Search
 * Console and project reads reuse the report's own query keys, so opening the
 * report costs nothing extra.
 */

const CHAPTER_TITLE = "Who ranks for your keyword";
const FEATURE = RUN_FEATURES.serpOverview;
/** r2-cache.ts keeps run payloads 90 days; past that this is a false claim. */
const MAX_RUN_AGE_DAYS = 90;
const TRAFFIC_HEAD = "Est. monthly traffic (whole site)";
const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );

const LEAD_SENTENCE =
  "This is the Google results page for one of your keywords on the day we last checked it — the sites ranking above you, how much traffic those sites pull in overall, and what else Google puts on that page besides the ordinary listings.";
const NEVER_RUN =
  "No search-results lookup has been saved for this project, so this report does not show who else ranks for your keywords.";
const UNDATED_RUN =
  "The saved search-results lookup carries no readable date, so this report cannot confirm it still describes today's results page.";
const tooOld = (on: string) =>
  `The most recent search-results lookup for this project was made on ${on}, too long ago to describe today's results page.`;
/**
 * Two different facts, and one sentence used to print for both.
 *
 * `results` is empty whenever no item came back with `type === "organic"` —
 * which includes a payload whose `items` array was empty outright, and those
 * runs ARE recorded (SerpOverviewService records after every live fetch). For
 * that payload the stored run establishes nothing about what Google put on the
 * page, so it cannot be told to the client as fact. `serpFeatures` separates
 * the two: it is non-empty only when non-organic blocks were actually seen.
 */
const ranButEmpty = (keyword: string, features: number) =>
  features > 0
    ? `The saved lookup for “${keyword}” found no ordinary listings on that results page — Google filled it entirely with ads and its own features.`
    : `The saved lookup for “${keyword}” came back with nothing on that results page — no ordinary listings, and none of Google's own blocks either — so this report cannot say what that page held.`;

/* ------------------------------------------------------------------ */
/*  Shapes the pure builder works on                                    */
/* ------------------------------------------------------------------ */

/**
 * One organic listing. Narrowed from the stored payload on purpose: it has no
 * previousRank / isUp / isDown, which are the provider's deltas between its own
 * crawls at unknown intervals, and an arrow in a monthly report would be read
 * as movement over that month.
 */
type SerpResult = Pick<
  z.infer<typeof serpOverviewSchema>["results"][number],
  "rank" | "title" | "url" | "domain" | "domainEtv"
>;

export type SerpOverviewRun = {
  keyword: string;
  /** ISO instant the SERP was actually fetched. */
  fetchedAt: string;
  /** The geography THAT run was captured against; null when not recorded. */
  geographyLabel: string | null;
  /** Null when Labs had no data for the keyword, or when its lookup threw. */
  searchVolume: number | null;
  domainTrafficUnavailable: boolean;
  results: SerpResult[];
  paaQuestions: string[];
  serpFeatures: Array<{ type: string; count: number }>;
};

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Is this SERP row the client's own site?
 *
 * Suffix match, not hostname equality: a client ranking through
 * `blog.example.com` or `shop.example.com` IS the client, and equality alone
 * printed that row unmarked among the competitors, the hero tile as an absence
 * and the narrative as "your site was not among the listings" — three false
 * statements from one comparison. Same test rank tracking already applies
 * (dataforseo/serp.ts) and local-seo and brand-visibility after it.
 */
function sameDomain(candidate: string | null, target: string | null): boolean {
  if (candidate == null || target == null) return false;
  try {
    const host = normalizeDomain(candidate);
    const own = normalizeDomain(target);
    return host === own || host.endsWith(`.${own}`);
  } catch {
    return false;
  }
}

/**
 * The lookup's own date and its age in days, or null when it cannot be read.
 *
 * A date and never a period: `fetchedAt` is the day somebody looked, unrelated
 * to the report's 28-day window, so this sheet says "on 14 July 2026" and can
 * never say "this month".
 *
 * The day is the reader's own calendar day, never the UTC one. A lookup run at
 * 9pm on 14 July in Chicago is stored as `2026-07-15T02:00:00Z`, and reading
 * that instant with `getUTCDate()` printed "15 July 2026" — a day the client
 * has not lived yet, and one that can read as LATER than the report's own
 * "Generated" foot, which ClientReportPage formats locally. `citations.tsx`
 * fixed the same defect by moving `formatDay` onto `toLocaleDateString`; this
 * chapter takes that same local calendar basis while keeping its own
 * day-month-year wording, so the two chapters agree on which day a stored
 * instant fell on.
 *
 * `days` stays the elapsed time between the two instants and is deliberately
 * NOT re-based on the calendar: the 90-day gate below is r2-cache's retention
 * window, which runs from the moment the payload was stored, so a lookup whose
 * local day reads a day earlier than its UTC day is still kept — and still
 * described as current — for exactly the same 90 × 24 hours.
 */
function describeAge(
  iso: string,
  referenceIso: string,
): { label: string; days: number } | null {
  const at = new Date(iso);
  const reference = new Date(referenceIso);
  if (Number.isNaN(at.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }
  return {
    label: `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`,
    days: (reference.getTime() - at.getTime()) / 86_400_000,
  };
}

/** Provider slugs, humanized — "ai_overview" must not print "Ai overview". */
function humanizeFeature(type: string): string {
  const words = type.replaceAll("_", " ").trim();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  return sentence.replace(/^Ai\b/, "AI");
}

/** The client's own listing, or null when no saved row is this site. */
function findClientRow(run: SerpOverviewRun, domain: string | null) {
  const own = run.results.find((r) => sameDomain(r.domain ?? r.url, domain));
  return own ?? null;
}

/**
 * The domain Google actually placed first, or null when the saved payload does
 * not establish which listing that was.
 *
 * Read off `rank`, never off array position. `mapSerpOverview` preserves the
 * provider's order and maps `domain: item.domain ?? null`, so the sentence
 * used to be handed `results.find((result) => result.domain)` — the first row
 * that happened to carry a domain. When the rank-1 listing came back without
 * one, a printed sheet told a paying client that the #2 site was "the
 * top-ranked result": a superlative read off list position rather than off the
 * one field that records position.
 *
 * Three payloads cannot establish the claim at all, and each returns null so
 * the sentence is left out rather than guessed at:
 *   - the best-ranked listing carries no domain — naming the runner-up is the
 *     original defect, not a fallback;
 *   - some listing carries no rank, so its position was never recorded and
 *     nothing rules it out as the first one (the same "a gap in the payload is
 *     not an absence from the page" reading the client's own row gets below);
 *   - two different domains tie for the best rank, which names no single one.
 */
function topRankedDomain(results: SerpResult[]): string | null {
  let best: { rank: number; domain: string | null } | null = null;
  let tied = false;
  for (const result of results) {
    if (result.rank == null) return null;
    if (best == null || result.rank < best.rank) {
      best = { rank: result.rank, domain: result.domain };
      tied = false;
    } else if (result.rank === best.rank && result.domain !== best.domain) {
      tied = true;
    }
  }
  return tied ? null : (best?.domain ?? null);
}

/** What the table's own header says it is showing. The table prints every
 *  listing the payload holds, so this is a count, never a silent cut. */
function savedAll(run: SerpOverviewRun): string {
  return `All ${run.results.length} ordinary listings the lookup saved from that page.`;
}

/**
 * The chapter's own narrative paragraphs.
 *
 * Kept here rather than added to `reportNarrative.ts`: that module is shared
 * with chapters other agents are editing in parallel, and this chapter is its
 * only caller. Same shape as the builders there — pure, no I/O, and every
 * sentence defensible from the arguments alone.
 */
export function buildSerpNarrative(
  run: SerpOverviewRun,
  domain: string | null,
  generatedAt: string,
): string[] {
  const on = describeAge(run.fetchedAt, generatedAt)?.label;
  const where = run.geographyLabel
    ? ` as searched from ${run.geographyLabel}`
    : "";
  const opening = `On ${on ?? "the day of the lookup"} we looked up “${run.keyword}”${where}.`;

  // Three states, not two. `undefined` = no saved row is this site; `null` = a
  // row that IS this site but carries no position, which is a gap in the
  // payload and never an absence from the page.
  const rank = domain == null ? undefined : findClientRow(run, domain)?.rank;
  const position =
    domain == null
      ? ""
      : rank === undefined
        ? ` Your site was not among the ${run.results.length} ordinary listings that lookup saved from that page.`
        : rank === null
          ? " Your site was one of the listings on that page, though the lookup did not record its position."
          : ` Your site ranked #${rank} on that results page.`;

  // Never `results.find(...)`: the claim is a superlative, so it comes from
  // `rank`, and it is dropped entirely when the payload cannot support it.
  const leader = topRankedDomain(run.results);
  const second = leader
    ? `The top-ranked result was ${leader}.`
    : "Google returned ordinary listings for this search, shown below.";
  const features =
    run.serpFeatures.length > 0
      ? " Google also placed its own blocks on that page, listed below: they sit above or between the ordinary listings, which is why a high position does not always bring the traffic it looks like it should."
      : "";

  return [LEAD_SENTENCE, `${opening}${position}`, `${second}${features}`];
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                           */
/* ------------------------------------------------------------------ */

/**
 * Rank | Page | whichever estimate columns actually have a source.
 *
 * Every saved listing gets a row. The table used to stop at ten of the twenty
 * a payload can hold, with nothing on the sheet saying so — so a client whose
 * own listing sat at #14 read "#14" in the hero, scanned "The results Google
 * returned", and found themselves missing from it.
 *
 * Each estimate column is dropped ENTIRELY, never dashed, when its own source
 * is unavailable: a "—" reads as "no traffic", an affirmative false statement
 * rather than a missing one. The traffic header names the whole site because
 * `domainEtv` is the competitor's site total, not this keyword's share of it.
 */
export function serpTable(run: SerpOverviewRun, domain: string | null) {
  const share = estimateTrafficShare(
    run.searchVolume,
    run.results.map((result) => result.rank),
  );
  const heads: string[] = [];
  if (!run.domainTrafficUnavailable) heads.push(TRAFFIC_HEAD);
  if (share) heads.push("Est. clicks from this keyword");
  const rows = run.results.map((result, index) => ({
    key: `${result.rank ?? "n"}-${result.url ?? index}`,
    rank: result.rank == null ? "—" : `${result.rank}`,
    title: result.title ?? result.domain ?? "Untitled result",
    path: toPath(result.url),
    isClient: sameDomain(result.domain ?? result.url, domain),
    values: heads.map((head) =>
      head === TRAFFIC_HEAD
        ? formatCount(result.domainEtv)
        : formatCount(
            result.rank == null ? null : share?.get(result.rank)?.clicks,
          ),
    ),
  }));
  return { heads, rows };
}

/**
 * The competitive field. Deliberately not `GscRowsTable`: its columns are
 * clicks/impressions/CTR/position, none of which exist in this payload, so
 * forcing the data through it would print whole-site traffic under "Clicks".
 */
function SerpResultsTable({ heads, rows }: ReturnType<typeof serpTable>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head className="text-right">Rank</Table.Head>
            <Table.Head>Page</Table.Head>
            {heads.map((head) => (
              <Table.Head key={head} className="text-right">
                {head}
              </Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.key}>
              <Table.Cell className="text-right tabular-nums">
                {row.rank}
              </Table.Cell>
              <Table.Cell className="max-w-md">
                <span className="line-clamp-1 font-medium">
                  {row.title}
                  {row.isClient ? <strong> — your site</strong> : null}
                </span>
                <span className="line-clamp-1 text-xs text-base-content/60">
                  {row.path}
                </span>
              </Table.Cell>
              {row.values.map((value, index) => (
                <Table.Cell
                  key={heads[index]}
                  className="text-right tabular-nums"
                >
                  {value}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

/** Each tile is omitted, never dashed, when its own source is unavailable —
 *  including a client row saved without a position, where a number would have
 *  to be invented and "not in the top N" would be a plain falsehood. */
export function heroItems(run: SerpOverviewRun, domain: string | null) {
  const items: Array<{ label: string; value: string }> = [];
  if (run.searchVolume != null) {
    items.push({
      label: "Monthly searches",
      value: formatCount(run.searchVolume),
    });
  }
  const rank = domain == null ? undefined : findClientRow(run, domain)?.rank;
  if (domain != null && rank !== null) {
    // The depth is the payload's own, never the 20-row ceiling: claiming "top
    // 20" over a ten-listing capture asserts a check that never happened.
    const value =
      rank === undefined ? `Not in the top ${run.results.length}` : `#${rank}`;
    items.push({ label: "Your position", value });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/*  The pure builder                                                    */
/* ------------------------------------------------------------------ */

/** Why there is no sheet, in the order a client would want to be told: a read
 *  that threw outranks a gap, and both outrank "nothing was ever run". */
const dropReason = (data: serpOverviewReportData): string =>
  data.readFailed ??
  data.snapshotGap ??
  (data.neverRun ? NEVER_RUN : (data.unvouched ?? NEVER_RUN));

export function buildserpOverviewChapter(
  data: serpOverviewReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  // This chapter renders only its own payload; the shared data sections belong
  // to the Search Console chapters.
  void sections;

  // A thrown read never reaches a run: a restored payload alongside a failed
  // gate read would print a keyword nothing has vouched for.
  const run = data.readFailed ? null : data.run;
  const age = run ? describeAge(run.fetchedAt, data.generatedAt) : null;
  if (!run) return out.drop(CHAPTER_TITLE, dropReason(data));
  if (!age) return out.drop(CHAPTER_TITLE, UNDATED_RUN);
  if (age.days > MAX_RUN_AGE_DAYS) {
    return out.drop(CHAPTER_TITLE, tooOld(age.label));
  }
  if (run.results.length === 0) {
    const why = ranButEmpty(run.keyword, run.serpFeatures.length);
    return out.drop(CHAPTER_TITLE, why);
  }

  const features = run.serpFeatures.map((feature) => ({
    label: humanizeFeature(feature.type),
    value: feature.count,
  }));
  const paragraphs = buildSerpNarrative(run, data.domain, data.generatedAt);
  out.add({
    key: "serp-overview",
    number: "04",
    kicker: "Opportunities",
    title: CHAPTER_TITLE,
    body: (
      <>
        <ReportHeroStats items={heroItems(run, data.domain)} />
        <ReportNarrative paragraphs={paragraphs} />
        <Section title="The results Google returned" subtitle={savedAll(run)}>
          <SerpResultsTable {...serpTable(run, data.domain)} />
        </Section>
        <ReportBreakdownCard
          title="Also on this results page"
          rows={features}
        />
        {run.paaQuestions.length > 0 ? (
          <Section title="Questions people ask alongside this search">
            <ul className="list-outside list-disc space-y-1 pl-5 text-[15px]">
              {run.paaQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </Section>
        ) : null}
        <ReportCallout>
          This is one saved lookup from {age.label}, not a tracked position: a
          results page can change within hours, so this describes what Google
          returned at that moment rather than where you stand today.
        </ReportCallout>
      </>
    ),
  });
}

/* ------------------------------------------------------------------ */
/*  The reads                                                           */
/* ------------------------------------------------------------------ */

function useSerpRun(projectId: string, runId: string | null, enabled: boolean) {
  return useAutoRestoredRun({
    projectId,
    feature: FEATURE,
    schema: serpOverviewSchema,
    enabled,
    runId,
  });
}

type RestoredSerpRun = {
  result: z.infer<typeof serpOverviewSchema>;
  params: unknown;
};

function toRun(restored: RestoredSerpRun | null): SerpOverviewRun | null {
  if (!restored) return null;
  const { result } = restored;
  const code = result.locationCode;
  // The run's own captured geography first, the stored location code's static
  // label second, and "not recorded" rather than an assumed national default.
  const stored = Object.hasOwn(LOCATIONS, code) ? LOCATIONS[code] : null;
  return {
    keyword: result.keyword,
    fetchedAt: result.fetchedAt,
    geographyLabel:
      parseRestoredSerpRunGeo(restored.params)?.serp.label ?? stored,
    searchVolume: result.keywordStatsUnavailable
      ? null
      : (result.keywordStats?.searchVolume ?? null),
    domainTrafficUnavailable: result.domainTrafficUnavailable,
    results: result.results,
    paaQuestions: result.paaQuestions,
    serpFeatures: result.serpFeatures,
  };
}

export function useserpOverviewReportData(projectId: string) {
  const generatedAt = useMemo(() => new Date().toISOString(), []);

  const projectsQuery = useFreeRead(["projects"], () => getProjects());
  // The gate the chapter's title rests on: keywords Search Console itself
  // already shows this site for. Its reads, and the sentence for "nothing here
  // could be vouched for", live in serpOverviewReads.ts.
  const gate = useVouchedKeywords(projectId);

  const latest = useSerpRun(projectId, null, true);
  const vouchedLatest = gate.vouches(latest.restored?.result.keyword);

  // Walk the history only when the newest run restored fine but was for a
  // keyword this site does not appear for. Same key AND limit as
  // RecentRunsList, so neither view rewrites the other's cached list.
  const needsWalk =
    latest.outcome === "ready" && !vouchedLatest && gate.hasQueries;
  const recentQuery = useQuery({
    queryKey: ["analysisRuns", "recent", projectId, FEATURE],
    queryFn: () =>
      getRecentRuns({ data: { projectId, feature: FEATURE, limit: 10 } }),
    staleTime: 60_000,
    enabled: needsWalk,
  });
  const pickedId = needsWalk
    ? ((recentQuery.data ?? []).find((row) => gate.vouches(row.label))?.id ??
      null)
    : null;
  const picked = useSerpRun(projectId, pickedId, pickedId != null);

  const chosen = vouchedLatest ? latest : pickedId ? picked : null;
  const restoring =
    !gate.settled ||
    latest.isRestoring ||
    (needsWalk && recentQuery.isPending) ||
    (pickedId != null && picked.isRestoring);

  // A thrown read outranks every "nothing here" verdict: this report is
  // printed, and "never run" blames the agency for work it may well have done.
  const lookupFailed =
    latest.isError || picked.isError || (needsWalk && recentQuery.isError);
  const gap = describeSnapshotGap({
    subject: "the saved search-results lookup",
    isError: lookupFailed,
    restoring,
    outcome: (chosen ?? latest).outcome,
    otherDomain: false,
  });
  const supporting = describeFailedReads(
    {
      gsc: gate.gscFailed,
      topQueries: gate.topQueriesFailed,
      projects: projectsQuery.isError,
    },
    ["gsc", "topQueries", "projects"],
  );

  const unvouched =
    !restoring && latest.outcome === "ready" && !vouchedLatest && !pickedId;
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);
  return {
    domain: project?.domain ?? null,
    /** The run that passed the relevance gate, or null. */
    run: toRun(chosen?.restored ?? null),
    /** A read threw. Outranks every other reason — never prints "never run". */
    readFailed: lookupFailed ? gap : supporting,
    /** Still loading / expired / unreadable, in describeSnapshotGap's words. */
    snapshotGap: gap,
    /** No SERP run row exists for this project at all. */
    neverRun: latest.outcome === "none",
    /** Runs exist but none could be vouched for; the sentence says why. */
    unvouched: unvouched ? gate.unvouchedReason : null,
    /** When the report was generated — the other end of the 90-day window. */
    generatedAt,
  };
}

export type serpOverviewReportData = ReturnType<
  typeof useserpOverviewReportData
>;
