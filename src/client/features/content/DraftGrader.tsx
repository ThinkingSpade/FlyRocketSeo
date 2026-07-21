import { useState } from "react";

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

/** Paste-a-draft coverage check against the brief's terms and questions. Runs
 *  entirely client-side — nothing is stored or sent anywhere. */
export function DraftGrader({
  terms,
  questions,
}: {
  terms: Array<{ keyword: string }>;
  questions: string[];
}) {
  const [draft, setDraft] = useState("");
  const normalized = draft.toLowerCase();
  const hasDraft = normalized.trim().length > 0;

  const termHits = terms.map((term) => ({
    keyword: term.keyword,
    covered: hasDraft && normalized.includes(term.keyword.toLowerCase()),
  }));
  const questionHits = questions.map((question) => ({
    question,
    covered: hasDraft && isQuestionCovered(normalized, question),
  }));
  const totalChecks = termHits.length + questionHits.length;
  const coveredChecks =
    termHits.filter((t) => t.covered).length +
    questionHits.filter((q) => q.covered).length;
  const score =
    hasDraft && totalChecks > 0
      ? Math.round((coveredChecks / totalChecks) * 100)
      : null;
  const wordCount = hasDraft ? significantWords(normalized).length : 0;

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
      </div>
    </div>
  );
}
