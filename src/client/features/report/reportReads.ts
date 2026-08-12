/**
 * Why something is missing from this report, in the words the printed sheet uses.
 *
 * This report is printed and handed to a client, so "we could not read this"
 * and "this was never run" are two different accusations, and the second one
 * blames the agency for work it may well have done all month. Only the two
 * metered detail queries ever read `isError`, and even those messages lived in
 * a `report-no-print` banner; every other failed read fell through `?? []` and
 * printed as the second sentence.
 *
 * The vocabulary lives here, apart from both chapter builders, so the choice
 * between the two is pure and can be asserted in a unit test instead of in a
 * PDF someone already sent.
 */

/** Every read the report draws on, named for what a client would call it. */
export type ReportReadKey =
  | "projects"
  | "gsc"
  | "topQueries"
  | "topPages"
  | "content"
  | "insights"
  | "audits"
  | "auditResults"
  | "onPage"
  | "brandVisibility"
  | "keywordDetails"
  | "backlinkDetails";

/**
 * How each read is described on a printed sheet.
 *
 * Deliberately the client's vocabulary, not the query's: "the Search Console
 * page breakdown", never "report-top-pages". Each key keeps its own subject
 * rather than collapsing into one "Search Console" bucket, because a partial
 * outage is the common case and a chapter that says "Search Console data could
 * not be read" while three other Search Console chapters printed fine reads as
 * a contradiction.
 */
const READ_SUBJECTS: Record<ReportReadKey, string> = {
  projects: "this project's own record",
  gsc: "Search Console data",
  topQueries: "the Search Console keyword breakdown",
  topPages: "the Search Console page breakdown",
  content: "page-by-page content performance",
  insights: "the internal link analysis",
  audits: "the site audit history",
  auditResults: "the last audit's page details",
  onPage: "the approved on-page rewrites",
  brandVisibility: "the saved AI visibility analysis",
  keywordDetails: "the keyword detail request",
  backlinkDetails: "the backlink detail request",
};

/** Which reads threw. Absent key means "did not fail", not "succeeded". */
export type ReportReadFailures = Readonly<
  Partial<Record<ReportReadKey, boolean>>
>;

function joinSubjects(subjects: readonly string[]): string {
  if (subjects.length === 1) return subjects[0];
  return `${subjects.slice(0, -1).join(", ")} and ${subjects[subjects.length - 1]}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The coverage-list reason for a chapter whose source reads failed.
 *
 * Returns null when none of `keys` failed, so callers can `??` straight through
 * to whatever their ordinary "nothing to show" sentence is — the failure always
 * wins, because it is the only one of the two that can be wrong in a way the
 * client would act on.
 */
export function describeFailedReads(
  failures: ReportReadFailures,
  keys: readonly ReportReadKey[],
): string | null {
  const subjects = keys
    .filter((key) => failures[key] === true)
    .map((key) => READ_SUBJECTS[key]);
  if (subjects.length === 0) return null;
  return `${sentenceCase(joinSubjects(subjects))} could not be read while this report was generated — ${
    subjects.length === 1 ? "that request" : "those requests"
  } failed rather than returning nothing.`;
}

/** `useAutoRestoredRun`'s verdict on a stored run. */
type SnapshotOutcome = "none" | "expired" | "unreadable" | "ready" | null;

/**
 * Why a saved analysis is not in this report, when there is more to say than
 * "it was never run".
 *
 * `useAutoRestoredRun` already separates expired from unreadable from absent,
 * and the report threw all of that away by destructuring only `{ restored }` —
 * so a run whose payload aged out of R2 after seven days printed as though the
 * agency had never run it. `otherDomain` is the fourth case and belongs to the
 * report alone: a snapshot restored fine but describes a domain this project no
 * longer uses.
 *
 * Returns null for the plain never-run case so each caller keeps wording that
 * in its own voice, naming the analysis the client should ask for.
 */
type SnapshotGapInput = {
  /** Lower-case noun phrase, e.g. "the saved backlink analysis". */
  subject: string;
  isError: boolean;
  /** The restore had not settled when the sheet was generated. */
  restoring: boolean;
  outcome: SnapshotOutcome;
  /** A run was restored, but for a different domain than this project's. */
  otherDomain: boolean;
};

// A caller that states a fault outright always gets a sentence back — the two
// branches below return before any `null` is reachable. Saying so in the type
// is what lets a chapter derive its own constants from this function instead of
// retyping the wording and drifting from it.
export function describeSnapshotGap(
  input: SnapshotGapInput & { isError: true },
): string;
export function describeSnapshotGap(
  input: SnapshotGapInput & { restoring: true },
): string;
export function describeSnapshotGap(input: SnapshotGapInput): string | null;
export function describeSnapshotGap({
  subject,
  restoring,
  isError,
  outcome,
  otherDomain,
}: SnapshotGapInput): string | null {
  if (isError) {
    return `${sentenceCase(subject)} could not be read while this report was generated — that request failed rather than returning nothing.`;
  }
  // A restore still in flight is neither present nor absent, and this page can
  // be printed mid-load. Same rule the Search Console chapters already follow.
  if (restoring) {
    return `${sentenceCase(subject)} was still loading when this report was generated.`;
  }
  if (outcome === "expired") {
    return `${sentenceCase(subject)} has expired — stored results are kept for a limited window — so it could not be included here. Re-running it restores this section.`;
  }
  if (outcome === "unreadable") {
    return `${sentenceCase(subject)} was saved in a format this report can no longer read. Re-running it restores this section.`;
  }
  if (otherDomain) {
    return `${sentenceCase(subject)} on file covers a different domain than this project, so it was not used.`;
  }
  return null;
}
