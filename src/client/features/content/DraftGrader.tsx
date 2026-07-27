import { useMemo, useState } from "react";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildContentVerdict } from "@/client/features/insights/verdicts/content";
import { computeOutlineThemes, isThemeCovered } from "./outlineGap";

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "why",
  "you",
  "your",
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** A question counts as answered when most of its meaningful words appear in
 *  the draft — crude, but catches "did you cover this at all". */
function isQuestionCovered(draft: string, question: string): boolean {
  const words = significantWords(question);
  if (words.length === 0) return false;
  const hits = words.filter((word) => draft.includes(word)).length;
  return hits / words.length >= 0.7;
}

/** Paste-a-draft coverage check against the brief's terms, questions, and the
 *  recurring sections competitors write. Runs entirely client-side — nothing
 *  is stored or sent anywhere. */
export function DraftGrader({
  projectId,
  keyword,
  targetWordCount,
  terms,
  questions,
  outlines = [],
}: {
  projectId: string;
  /** The brief's target keyword, for the verdict's read. */
  keyword: string;
  /** Median word count across analyzed top-ranking pages (the same value
   *  BriefTargets shows), null until competitor outlines have been
   *  analyzed. */
  targetWordCount: number | null;
  terms: Array<{ keyword: string }>;
  questions: string[];
  /** Each competitor's H2 outline, for the outline-coverage check. */
  outlines?: string[][];
}) {
  const [draft, setDraft] = useState("");
  const normalized = draft.toLowerCase();
  const hasDraft = normalized.trim().length > 0;

  const outlineThemes = useMemo(
    () => computeOutlineThemes(outlines),
    [outlines],
  );
  const themeHits = outlineThemes.map((theme) => ({
    theme,
    covered: hasDraft && isThemeCovered(normalized, theme),
  }));

  const termHits = terms.map((term) => ({
    keyword: term.keyword,
    covered: hasDraft && normalized.includes(term.keyword.toLowerCase()),
  }));
  const questionHits = questions.map((question) => ({
    question,
    covered: hasDraft && isQuestionCovered(normalized, question),
  }));
  const totalChecks = termHits.length + questionHits.length + themeHits.length;
  const coveredChecks =
    termHits.filter((t) => t.covered).length +
    questionHits.filter((q) => q.covered).length +
    themeHits.filter((t) => t.covered).length;
  const score =
    hasDraft && totalChecks > 0
      ? Math.round((coveredChecks / totalChecks) * 100)
      : null;
  const wordCount = hasDraft ? significantWords(normalized).length : 0;

  // Computed once here (not inside the map callbacks below) so the verdict
  // and the coverage lists underneath it read the exact same coverage.
  const missingSubtopics = themeHits
    .filter((hit) => !hit.covered)
    .map((hit) => hit.theme.label);
  const unansweredQuestions = questionHits
    .filter((hit) => !hit.covered)
    .map((hit) => hit.question);
  const verdict = buildContentVerdict({
    keyword,
    targetWordCount,
    currentWordCount: hasDraft ? wordCount : null,
    missingSubtopics,
    totalSubtopics: outlineThemes.length,
    unansweredQuestions,
    totalQuestions: questions.length,
  });

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Grade your draft</h2>
          {score != null ? (
            <span
              className={`badge ${
                score >= 70
                  ? "badge-success"
                  : score >= 40
                    ? "badge-warning"
                    : "badge-error"
              }`}
            >
              {score}% covered · ~{wordCount.toLocaleString()} words
            </span>
          ) : null}
        </div>
        <p className="text-xs text-base-content/60">
          Paste your article to see which target terms and questions it already
          covers. Checked entirely in your browser.
        </p>
        <textarea
          className="textarea textarea-bordered h-32 w-full text-sm"
          placeholder="Paste your draft here…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {/* Nothing defensible to say before a draft exists -- this is that
            state's empty state, so the card waits for hasDraft rather than
            rendering an "unknown" tone by default. */}
        {hasDraft ? (
          <NextStepsCard
            verdict={verdict}
            projectId={projectId}
            tab="Content Optimizer"
          />
        ) : null}
        {hasDraft ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {termHits.map((term) => (
                <span
                  key={term.keyword}
                  className={`badge badge-sm ${
                    term.covered ? "badge-success" : "badge-ghost"
                  }`}
                >
                  {term.covered ? "✓ " : ""}
                  {term.keyword}
                </span>
              ))}
            </div>
            {questionHits.length > 0 ? (
              <ul className="space-y-0.5 text-sm">
                {questionHits.map((entry) => (
                  <li
                    key={entry.question}
                    className={
                      entry.covered ? "text-success" : "text-base-content/60"
                    }
                  >
                    {entry.covered ? "✓" : "○"} {entry.question}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {themeHits.length > 0 ? (
          <div className="space-y-1 border-t border-base-200 pt-2">
            <p className="text-xs font-medium text-base-content/70">
              Outline coverage
              <span className="font-normal text-base-content/50">
                {" "}
                — sections most ranking pages include
              </span>
            </p>
            <ul className="space-y-0.5 text-sm">
              {themeHits.map(({ theme, covered }) => (
                <li
                  key={theme.label}
                  className={covered ? "text-success" : "text-base-content/60"}
                >
                  {hasDraft ? (covered ? "✓" : "○") : "•"} {theme.label}
                  <span className="text-xs text-base-content/40">
                    {" "}
                    · {theme.competitorCount} of the top pages
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
