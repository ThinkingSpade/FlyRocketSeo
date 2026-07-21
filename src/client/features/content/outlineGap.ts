// Pure outline-theme clustering for the Content Optimizer draft grader
// (no I/O), split out so the matching rules are unit-testable.

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
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
  "our",
  "the",
  "to",
  "top",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
  "you",
  "your",
]);

type OutlineTheme = {
  /** Representative heading (the shortest in the cluster). */
  label: string;
  /** How many competitors have a section on this theme. */
  competitorCount: number;
  /** Meaningful words that define the theme. */
  words: string[];
};

/** Light stemming so "machines"/"machine" and "costs"/"cost" cluster. */
function stem(word: string): string {
  return word.length >= 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function significantWords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 1 && !STOPWORDS.has(word))
        .map(stem),
    ),
  ];
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const shared = a.filter((word) => bSet.has(word)).length;
  return shared / Math.min(a.length, b.length);
}

/** Two headings are the same theme when most of the shorter one's meaningful
 *  words appear in the other ("Pricing & costs" ≈ "Vending machine costs"). */
const THEME_MATCH_RATIO = 0.6;

/** Words in more than half of all headings (the shared topic itself, e.g.
 *  "vending machine") say nothing about a section's theme — drop them so
 *  clusters form on the distinctive words. Only kicks in once there are
 *  enough headings for frequency to mean anything. */
const TOPIC_WORD_MIN_HEADINGS = 4;
const TOPIC_WORD_DF = 0.5;

function distinctiveWordsPerHeading(
  outlines: string[][],
): Map<string, string[]> {
  const allHeadings = outlines.flat();
  const wordsByHeading = new Map<string, string[]>();
  const documentFrequency = new Map<string, number>();

  for (const heading of allHeadings) {
    if (wordsByHeading.has(heading)) continue;
    const words = significantWords(heading);
    wordsByHeading.set(heading, words);
    for (const word of words) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
  }

  if (allHeadings.length < TOPIC_WORD_MIN_HEADINGS) return wordsByHeading;

  const threshold = allHeadings.length * TOPIC_WORD_DF;
  for (const [heading, words] of wordsByHeading) {
    const distinctive = words.filter(
      (word) => (documentFrequency.get(word) ?? 0) <= threshold,
    );
    // A heading made purely of topic words keeps them rather than vanish.
    if (distinctive.length > 0) wordsByHeading.set(heading, distinctive);
  }
  return wordsByHeading;
}

/**
 * Cluster competitor H2 outlines into recurring themes. A theme is worth
 * surfacing when at least two competitors have a section on it — one page's
 * quirky heading isn't consensus. Sorted by competitor count, then label.
 */
export function computeOutlineThemes(outlines: string[][]): OutlineTheme[] {
  type Cluster = {
    label: string;
    words: string[];
    competitors: Set<number>;
  };
  const clusters: Cluster[] = [];
  const wordsByHeading = distinctiveWordsPerHeading(outlines);

  outlines.forEach((headings, competitorIndex) => {
    for (const heading of headings) {
      const words = wordsByHeading.get(heading) ?? [];
      if (words.length === 0) continue;

      const match = clusters.find(
        (cluster) => overlapRatio(words, cluster.words) >= THEME_MATCH_RATIO,
      );
      if (match) {
        match.competitors.add(competitorIndex);
        // Merge vocabulary so later variants still match the cluster.
        match.words = [...new Set([...match.words, ...words])];
        if (heading.length < match.label.length) match.label = heading;
      } else {
        clusters.push({
          label: heading,
          words,
          competitors: new Set([competitorIndex]),
        });
      }
    }
  });

  return clusters
    .filter((cluster) => cluster.competitors.size >= 2)
    .map((cluster) => ({
      label: cluster.label,
      competitorCount: cluster.competitors.size,
      words: cluster.words,
    }))
    .toSorted(
      (a, b) =>
        b.competitorCount - a.competitorCount || a.label.localeCompare(b.label),
    );
}

/** A theme counts as covered when most of its defining words show up in the
 *  draft — same crude-but-useful bar as the question check. */
export function isThemeCovered(
  normalizedDraft: string,
  theme: OutlineTheme,
): boolean {
  if (theme.words.length === 0) return false;
  const hits = theme.words.filter((word) =>
    normalizedDraft.includes(word),
  ).length;
  return hits / theme.words.length >= 0.5;
}
