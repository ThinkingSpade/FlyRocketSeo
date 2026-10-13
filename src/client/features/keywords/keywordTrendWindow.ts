import type { MonthlySearch } from "@/types/keywords";
import { keywordMonthlySearches } from "@/shared/keyword-observations";

/** Calendar slots for display only. Null slots do not create observations. */
export function keywordTrendWindow(trend: MonthlySearch[]): MonthlySearch[] {
  const sorted = keywordMonthlySearches(trend);
  if (sorted.length === 0) return [];
  const first = sorted[0].year * 12 + sorted[0].month - 1;
  const last =
    sorted[sorted.length - 1].year * 12 + sorted[sorted.length - 1].month - 1;
  const byMonth = new Map(
    sorted.map((entry) => [entry.year * 12 + entry.month - 1, entry]),
  );
  return Array.from({ length: Math.min(12, last - first + 1) }, (_, index) => {
    const calendar = Math.max(first, last - 11) + index;
    return (
      byMonth.get(calendar) ?? {
        year: Math.floor(calendar / 12),
        month: (calendar % 12) + 1,
        searchVolume: null,
      }
    );
  });
}
