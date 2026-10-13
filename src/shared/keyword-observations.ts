import { z } from "zod";
import { providerCount } from "@/shared/provider-observations";
import type { MonthlySearch } from "@/types/keywords";

export function keywordEstimate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function keywordRatio(value: unknown): number | null {
  const estimate = keywordEstimate(value);
  return estimate !== null && estimate <= 1 ? estimate : null;
}

export function keywordScore(value: unknown): number | null {
  const count = providerCount(value);
  return count !== null && count <= 100 ? count : null;
}

export function keywordPosition(value: unknown): number | null {
  const count = providerCount(value);
  return count !== null && count > 0 ? count : null;
}

export const monthlySearchSchema = z.object({
  year: z.number().int().min(1).max(9999),
  month: z.number().int().min(1).max(12),
  searchVolume: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
});

/** Keep reported calendar gaps unknown; never add unreported months. */
export function keywordMonthlySearches(entries: unknown): MonthlySearch[] {
  if (!Array.isArray(entries)) return [];
  const observations: unknown[] = entries;
  const rows = new Map<string, MonthlySearch>();
  for (const entry of observations) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("year" in entry) ||
      !("month" in entry)
    )
      continue;
    const parsed = monthlySearchSchema.safeParse({
      year: entry.year,
      month: entry.month,
      searchVolume: providerCount(
        "search_volume" in entry
          ? entry.search_volume
          : "searchVolume" in entry
            ? entry.searchVolume
            : null,
      ),
    });
    if (!parsed.success) continue;
    const key = `${parsed.data.year}-${parsed.data.month}`;
    const prior = rows.get(key);
    // Conflicting observations for the same month cannot support a value.
    rows.set(
      key,
      prior && prior.searchVolume !== parsed.data.searchVolume
        ? { ...parsed.data, searchVolume: null }
        : parsed.data,
    );
  }
  return [...rows.values()].toSorted(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
  );
}
