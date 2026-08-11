import { unknownVerdict, type Verdict } from "../types";

/**
 * Two reads that share the same "what does this page need to compete"
 * question, at two different scopes:
 *
 * `buildContentVerdict` grades one pasted draft (Content Optimizer's
 * DraftGrader) against the brief built from the pages that already rank:
 * word-count gap against their median length, missing recurring subtopics,
 * unanswered People-Also-Ask questions. There is no "current word count"
 * without a pasted draft -- Content Optimizer never analyzes a URL of the
 * user's own, only a target keyword -- so this module has nothing honest to
 * say until one exists.
 *
 * `buildClustersVerdict` picks which content gap (a Topic Clusters spoke) is
 * worth building a hub page around. The brief's plain
 * `{ name, keywordCount, totalVolume }` shape would force a volume-only
 * pick, but the tab's own ranking (prioritizeClusters, clusterPriorities.ts)
 * already discounts volume by difficulty for exactly this "worth it"
 * question -- reusing its output (already sorted, already carrying
 * averageDifficulty) guarantees this card can never recommend a different
 * cluster than the plan's own priority badges show.
 */

/** Within this share of the target word count, length itself isn't the
 *  blocker -- the gap is close enough that other factors (subtopics,
 *  questions, quality) matter more than a few hundred words either way. */
const CLOSE_LENGTH_RATIO = 0.1;

/** Two or more simultaneous gaps -- length AND coverage both falling short
 *  -- is a strong enough signal to call the draft not competitive yet, not
 *  just missing one thing. */
const MULTIPLE_GAPS_THRESHOLD = 2;

function formatCount(value: number): string {
  return value.toLocaleString();
}

function pluralize(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** "a, b, and c" -- never an Oxford-comma-less join, so a three-clause read
 *  never reads as a run-on. */
function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

type DimensionRead = {
  clause: string;
  hasGap: boolean;
  action: Verdict["actions"][number] | null;
};

function describeLength(current: number, target: number): DimensionRead {
  const gapRatio = (target - current) / target;
  if (gapRatio < CLOSE_LENGTH_RATIO) {
    return {
      clause: `meets the ${formatCount(target)}-word median across analyzed top pages`,
      hasGap: false,
      action: null,
    };
  }
  const wordsShort = target - current;
  return {
    clause: `is ${formatCount(wordsShort)} words short of the ${formatCount(target)}-word median across analyzed top pages`,
    hasGap: true,
    action: {
      label: `Add roughly ${formatCount(wordsShort)} words to reach the ~${formatCount(target)}-word target`,
      evidence: `Current draft is ${formatCount(current)} words vs a ${formatCount(target)}-word median across analyzed top-ranking pages`,
      weight: 100,
    },
  };
}

function describeSubtopics(missing: string[], total: number): DimensionRead {
  if (missing.length === 0) {
    return {
      clause: `covers all ${pluralize(total, "recurring subtopic")}`,
      hasGap: false,
      action: null,
    };
  }
  const label =
    missing.length === 1
      ? `Cover the missing subtopic: "${missing[0]}"`
      : `Cover ${formatCount(missing.length)} missing subtopics, starting with "${missing[0]}"`;
  return {
    clause: `is missing ${formatCount(missing.length)} of ${pluralize(total, "recurring subtopic")}`,
    hasGap: true,
    action: {
      label,
      evidence: `${formatCount(missing.length)} of ${pluralize(total, "recurring section")} top-ranking pages cover ${missing.length === 1 ? "is" : "are"} missing from your draft`,
      weight: 80,
    },
  };
}

function describeQuestions(unanswered: string[], total: number): DimensionRead {
  if (unanswered.length === 0) {
    return {
      clause: `answers all ${pluralize(total, "searcher question")}`,
      hasGap: false,
      action: null,
    };
  }
  const label =
    unanswered.length === 1
      ? `Answer "${unanswered[0]}"`
      : `Answer ${formatCount(unanswered.length)} unanswered questions, starting with "${unanswered[0]}"`;
  return {
    clause: `leaves ${formatCount(unanswered.length)} of ${pluralize(total, "searcher question")} unanswered`,
    hasGap: true,
    action: {
      label,
      evidence: `${formatCount(unanswered.length)} of ${pluralize(total, "searcher question")} aren't addressed in your draft`,
      weight: 60,
    },
  };
}

type ContentVerdictInput = {
  keyword: string;
  /** Median word count across analyzed top-ranking pages (BriefTargets'
   *  own quantile(wordCounts, 0.5)) -- null until competitor outlines have
   *  been analyzed. */
  targetWordCount: number | null;
  /** Significant-word count of the user's pasted draft (DraftGrader's own
   *  `wordCount`). Null before any draft is pasted -- there is nothing this
   *  module can grade without one. */
  currentWordCount: number | null;
  missingSubtopics: string[];
  /** Total recurring subtopics checked (computeOutlineThemes' output
   *  length). Needed because an empty `missingSubtopics` is ambiguous
   *  otherwise: it means "the draft covers everything" only when this is
   *  > 0; at 0 there was nothing extracted to check against at all (e.g.
   *  competitor outlines haven't been analyzed yet). Not in the brief's
   *  signature, which had no way to resolve that ambiguity honestly. */
  totalSubtopics: number;
  unansweredQuestions: string[];
  /** Total People-Also-Ask questions checked, for the same reason
   *  `totalSubtopics` is needed above. */
  totalQuestions: number;
  /**
   * The metro the analyzed competitor pages were ranked in (Task 6), when
   * the brief's ranking-pages lookup resolved to a LOCAL geo -- every
   * dimension this verdict reads (target length, subtopics, questions) is
   * derived from that same competitor set, so a local scope qualifies the
   * whole read, not just one clause. Optional so every pre-Task-6
   * caller/test keeps compiling unchanged.
   */
  areaLabel?: string | null;
};

export function buildContentVerdict(input: ContentVerdictInput): Verdict {
  if (input.currentWordCount == null) {
    return unknownVerdict(
      `Paste a draft below to see what it's missing compared to the top-ranking pages for "${input.keyword}".`,
    );
  }

  const lengthAvailable = input.targetWordCount != null;
  const subtopicsAvailable = input.totalSubtopics > 0;
  const questionsAvailable = input.totalQuestions > 0;
  if (!lengthAvailable && !subtopicsAvailable && !questionsAvailable) {
    return unknownVerdict(
      `There is nothing in this brief yet to grade your draft against for "${input.keyword}" -- no target length, subtopics, or questions are available.`,
    );
  }

  const dimensions = [
    lengthAvailable
      ? describeLength(input.currentWordCount, input.targetWordCount ?? 0)
      : null,
    subtopicsAvailable
      ? describeSubtopics(input.missingSubtopics, input.totalSubtopics)
      : null,
    questionsAvailable
      ? describeQuestions(input.unansweredQuestions, input.totalQuestions)
      : null,
  ].filter((dimension): dimension is DimensionRead => dimension != null);

  const gapCount = dimensions.filter((dimension) => dimension.hasGap).length;
  const actions = dimensions
    .map((dimension) => dimension.action)
    .filter((action): action is NonNullable<typeof action> => action != null);
  const bareRead = `Your draft for "${input.keyword}" ${joinWithAnd(dimensions.map((d) => d.clause))}.`;
  // Every dimension above traces back to the same analyzed competitor set,
  // so a local scope qualifies the whole sentence -- see `areaLabel`'s own
  // doc comment.
  const read = input.areaLabel
    ? `In ${input.areaLabel}, ${bareRead.charAt(0).toLowerCase()}${bareRead.slice(1)}`
    : bareRead;

  const tone: Verdict["tone"] =
    gapCount === 0
      ? "good"
      : gapCount >= MULTIPLE_GAPS_THRESHOLD
        ? "bad"
        : "mixed";

  return { read, tone, actions };
}

/* ------------------------------------------------------------------ */
/*  Topic Clusters                                                     */
/* ------------------------------------------------------------------ */

type ClusterCandidate = {
  name: string;
  /** Renamed from the brief's bare `keywordCount` -- the real cluster shape
   *  (TopicCluster, clusterPriorities.ts) holds a `keywords` array, not a
   *  count; the wiring passes `keywords.length`. */
  keywordCount: number;
  totalVolume: number;
  /** Average keyword difficulty across the cluster's keywords that have one
   *  (prioritizeClusters' own `averageDifficulty`), null when none do. Not
   *  in the brief's signature -- added because "worth a hub" can't be
   *  judged from volume alone, and the tab's own ranking already computes
   *  this for exactly that reason (see module header). */
  averageDifficulty: number | null;
};

type ClustersVerdictInput = {
  topic: string;
  /** Pre-sorted by opportunity -- prioritizeClusters' own output order
   *  (descending volume discounted by difficulty). This module reads
   *  clusters[0] as the lead candidate rather than re-ranking, so it can
   *  never disagree with the plan's own priority badges. */
  clusters: ClusterCandidate[];
  /**
   * The project's CONFIRMED target area, when one exists -- NOT whether it
   * applied here (Task 6: Topic Clusters' keyword-idea source, Labs
   * `keyword_suggestions`, has no metro-capable equivalent wired up, so
   * volume/difficulty here are always national regardless). Set this
   * whenever a target area is confirmed at all, so the verdict can flag the
   * mismatch a user watching the header ScopeControl show a metro would
   * otherwise reasonably assume applies here too. Optional so every
   * pre-Task-6 caller/test keeps compiling unchanged.
   */
  confirmedAreaLabel?: string | null;
};

/** Appends the "these numbers are still nationwide" caveat when a target
 *  area is confirmed but Topic Clusters can't use it -- see
 *  `confirmedAreaLabel`'s own doc comment. No-ops otherwise. */
function withUnusedAreaNote(
  confirmedAreaLabel: string | null | undefined,
  sentence: string,
): string {
  if (!confirmedAreaLabel) return sentence;
  return `${sentence} (Volume and difficulty are nationwide; ${confirmedAreaLabel} isn't used for topic clusters yet.)`;
}

/** Below this combined monthly search volume across a cluster's keywords,
 *  there isn't enough real demand to justify a dedicated hub page -- a
 *  conservative floor, not a target. */
const MIN_CLUSTER_VOLUME = 100;

/** Keyword difficulty here is scored 0-100; the top of that scale usually
 *  needs significant existing authority to break into, so a cluster
 *  averaging this high is a stretch even as the best of the clusters found. */
const HIGH_DIFFICULTY_KD = 70;

export function buildClustersVerdict(input: ClustersVerdictInput): Verdict {
  if (input.clusters.length === 0) {
    return unknownVerdict(`No clusters were found for "${input.topic}".`);
  }

  const lead = input.clusters[0];

  if (lead.totalVolume < MIN_CLUSTER_VOLUME) {
    return {
      read: withUnusedAreaNote(
        input.confirmedAreaLabel,
        `None of the ${pluralize(input.clusters.length, "cluster")} found for "${input.topic}" have much search demand -- the strongest, "${lead.name}", totals only ${formatCount(lead.totalVolume)} searches/mo across ${pluralize(lead.keywordCount, "keyword")}.`,
      ),
      tone: "bad",
      actions: [
        {
          label: `Try a broader seed topic than "${input.topic}"`,
          evidence: `Best cluster found ("${lead.name}") totals only ${formatCount(lead.totalVolume)} searches/mo`,
          weight: 50,
        },
      ],
    };
  }

  const difficultyClause =
    lead.averageDifficulty != null
      ? ` at an average difficulty of ${lead.averageDifficulty}`
      : "";

  if (
    lead.averageDifficulty != null &&
    lead.averageDifficulty >= HIGH_DIFFICULTY_KD
  ) {
    return {
      read: withUnusedAreaNote(
        input.confirmedAreaLabel,
        `"${lead.name}" is the strongest gap found for "${input.topic}" -- ${pluralize(lead.keywordCount, "keyword")} totaling ${formatCount(lead.totalVolume)} searches/mo, but${difficultyClause}, it won't be an easy hub to rank.`,
      ),
      tone: "mixed",
      actions: [
        {
          label: `Build a hub page around "${lead.name}", starting with its easier keywords`,
          evidence: `Average difficulty ${lead.averageDifficulty} across ${formatCount(lead.keywordCount)} keywords`,
          to: {
            to: "/p/$projectId/content" as const,
            search: { q: lead.name },
          },
          weight: 70,
        },
      ],
    };
  }

  return {
    read: withUnusedAreaNote(
      input.confirmedAreaLabel,
      `"${lead.name}" is the strongest gap worth a hub page -- ${pluralize(lead.keywordCount, "keyword")} totaling ${formatCount(lead.totalVolume)} searches/mo${difficultyClause}.`,
    ),
    tone: "good",
    actions: [
      {
        label: `Build a hub page around "${lead.name}"`,
        evidence: `${formatCount(lead.keywordCount)} keywords, ${formatCount(lead.totalVolume)} searches/mo${lead.averageDifficulty != null ? `, average difficulty ${lead.averageDifficulty}` : ""}`,
        // Content Optimizer builds the brief for the hub this names.
        to: {
          to: "/p/$projectId/content" as const,
          search: { q: lead.name },
        },
        weight: 100,
      },
    ],
  };
}
