import type { CitySiteMatchStatus } from "@/server/features/city-sites/repositories/CitySiteRepository";

/**
 * How each match status is worded and coloured, in one place so the coverage
 * cards, the table badges and the filter chips cannot drift apart.
 *
 * The wording is doing real work here. "Unmatched" and "ambiguous" are not
 * errors — they are the importer refusing to guess, and the copy has to say so,
 * or an operator reads a 40-row "needs a city" count as 40 broken imports and
 * goes looking for a bug instead of clicking the fix button.
 */
export const CITY_SITE_STATUS_META: Record<
  CitySiteMatchStatus,
  { label: string; badgeClass: string; description: string }
> = {
  matched: {
    label: "Matched",
    badgeClass: "badge-success",
    description: "Pinned to a city, ready to use as a location.",
  },
  ambiguous: {
    label: "Needs a pick",
    badgeClass: "badge-warning",
    description:
      "Several US cities share this name and the hostname does not say which state. Pick one to resolve it.",
  },
  unmatched: {
    label: "No city found",
    badgeClass: "badge-ghost",
    description:
      "No seeded city carries this name. Set the location by hand, or check the subdomain spelling.",
  },
};

export const CITY_SITE_STATUS_ORDER = [
  "matched",
  "ambiguous",
  "unmatched",
] as const satisfies readonly CitySiteMatchStatus[];

export const CITY_SITE_PAGE_SIZES = [25, 50, 100, 200] as const;

/**
 * How the list is ordered. "host" is the D1 ordering; "clicks" is the Search
 * Console ordering, which the database cannot produce because the figure lives
 * at Google — see CitySitesPage for how that page is assembled.
 */
export type CitySiteSort = "host" | "clicks";

export type CitySiteDateRange =
  | "last_7_days"
  | "last_28_days"
  | "last_3_months"
  | "last_6_months";

const DATE_RANGES: readonly CitySiteDateRange[] = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
  "last_6_months",
];

export function toCitySiteDateRange(value: string): CitySiteDateRange {
  return DATE_RANGES.find((range) => range === value) ?? "last_28_days";
}

export function parseCitySitePageSize(
  value: string,
): (typeof CITY_SITE_PAGE_SIZES)[number] {
  const parsed = Number(value);
  return (
    CITY_SITE_PAGE_SIZES.find((size) => size === parsed) ??
    CITY_SITE_PAGE_SIZES[1]
  );
}

/** "Austin, TX" — falls back to whatever half of the pair we actually have. */
export function formatCityLabel(
  cityName: string | null,
  stateCode: string | null,
): string | null {
  if (!cityName) return null;
  return stateCode ? `${cityName}, ${stateCode}` : cityName;
}
