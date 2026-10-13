type Analysis = {
  wordCount: number | null;
  h2: string[];
  h2Available?: boolean;
};

export function contentEvidenceCounts(analyses: Analysis[]) {
  return {
    wordCounts: analyses
      .map((analysis) => providerCount(analysis.wordCount))
      .filter((count): count is number => count !== null)
      .toSorted((a, b) => a - b),
    h2Counts: analyses
      .filter((analysis) => analysis.h2Available === true)
      .map((analysis) => analysis.h2.length)
      .toSorted((a, b) => a - b),
  };
}
import { providerCount } from "@/shared/provider-observations";
