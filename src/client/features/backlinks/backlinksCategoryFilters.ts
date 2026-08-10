import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";

/**
 * The six profile-breakdown drill-downs, as seen from the client.
 *
 * Each breakdown card maps to exactly one filter field, and each selectable row
 * to exactly one raw DataForSEO value, because one row must cost exactly one
 * filter condition. Raw values are what we store and send (`IN`, `com`,
 * `blogs`); humanizing is a display concern only, and a humanized label must
 * never reach the request.
 */

export const CATEGORY_FILTER_FIELDS = [
  "sourceCountry",
  "sourceTld",
  "itemType",
  "linkAttribute",
  "sourcePlatformType",
  "semanticLocation",
] as const;

export type CategoryFilterField = (typeof CATEGORY_FILTER_FIELDS)[number];

/** Chip and accessible-name prefix for each dimension. */
export const CATEGORY_FILTER_LABELS: Record<CategoryFilterField, string> = {
  sourceCountry: "Country",
  sourceTld: "Top-level domain",
  itemType: "Link type",
  linkAttribute: "Attribute",
  sourcePlatformType: "Site type",
  semanticLocation: "Placement",
};

/**
 * Shown in place of a row whose label the provider left blank. This is not
 * hypothetical: a real profile returns an empty country code carrying most of
 * its links, and rendering that as a nameless bar reads as a broken card.
 */
const CATEGORY_MISSING_LABELS: Record<CategoryFilterField, string> = {
  sourceCountry: "Country not provided",
  sourceTld: "TLD not provided",
  itemType: "Link type not provided",
  linkAttribute: "Attribute not provided",
  sourcePlatformType: "Site type not provided",
  semanticLocation: "Placement not provided",
};

const CATEGORY_NAMES: Record<CategoryFilterField, string> = {
  sourceCountry: "country",
  sourceTld: "top-level domain",
  itemType: "link type",
  linkAttribute: "link attribute",
  sourcePlatformType: "site type",
  semanticLocation: "placement",
};

/**
 * A row can be drilled into only when it carries a value the filter can send.
 * A blank label cannot: there is no value to match on, and sending an empty
 * string would silently return the unfiltered list.
 */
export function isSelectableCategoryValue(rawValue: string): boolean {
  return rawValue.trim() !== "";
}

let countryNames: Intl.DisplayNames | null | undefined;

/** `IN` -> `India (IN)`, falling back to the raw code where ICU has no name. */
function formatCountry(rawValue: string): string {
  const code = rawValue.trim().toUpperCase();
  if (code.length !== 2) return rawValue;
  if (countryNames === undefined) {
    try {
      countryNames = new Intl.DisplayNames(undefined, { type: "region" });
    } catch {
      countryNames = null;
    }
  }
  const name = countryNames?.of(code);
  return name && name !== code ? `${name} (${code})` : code;
}

/** `noopener` -> `Noopener`, `pages.dev` -> `pages.dev`. */
function titleCase(rawValue: string): string {
  const spaced = rawValue.replace(/[_-]+/g, " ").trim();
  if (spaced === "") return rawValue;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Display form of one raw value. TLDs keep their leading dot for readability
 * but are stored and sent bare, since that is what `tld_from` matches.
 */
export function formatCategoryValue(
  field: CategoryFilterField,
  rawValue: string,
): string {
  const trimmed = rawValue.trim();
  if (trimmed === "") return CATEGORY_MISSING_LABELS[field];
  if (field === "sourceCountry") return formatCountry(trimmed);
  if (field === "sourceTld") return `.${trimmed.replace(/^\./, "")}`;
  return titleCase(trimmed);
}

type BreakdownInputRow = { label: string; value: number };

type PresentedBreakdownRow = BreakdownInputRow & {
  normalizedLabel: string;
  displayLabel: string;
};

type BreakdownPresentation = {
  mode: "meters" | "sentence" | "not-provided";
  rows: PresentedBreakdownRow[];
  max: number | null;
  notice: string | null;
  sentence: string | null;
};

function countLabel(value: number): string {
  return value === 1 ? "backlink" : "backlinks";
}

function missingCategorySentence(
  field: CategoryFilterField,
  missing: number,
  totalBacklinks: number,
): string {
  const subject =
    field === "sourceCountry" ? "Country" : CATEGORY_FILTER_LABELS[field];
  return `${subject} not reported for ${missing.toLocaleString()} of ${totalBacklinks.toLocaleString()} ${countLabel(totalBacklinks)}`;
}

function singleCategorySentence(
  field: CategoryFilterField,
  row: PresentedBreakdownRow,
): string {
  const normalized = row.normalizedLabel.toLowerCase();
  if (field === "sourcePlatformType" && normalized === "unknown") {
    return "Site type wasn't classified for this profile";
  }
  if (field === "semanticLocation" && normalized === "anchor") {
    return "Placement wasn't classified for this profile";
  }
  return `${row.displayLabel} is the only ${CATEGORY_NAMES[field]} reported`;
}

/**
 * Turns provider breakdown rows into an honest display decision. Selectable
 * rows stay one-for-one with their raw input values; only blank rows are
 * summarized as missing data because there is no value a filter can send.
 */
export function prepareBreakdownPresentation(
  field: CategoryFilterField,
  inputRows: BreakdownInputRow[],
  totalBacklinks: number | null,
): BreakdownPresentation {
  const rows: PresentedBreakdownRow[] = [];
  let missing = 0;

  for (const row of inputRows) {
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    const normalizedLabel = row.label.trim();
    if (!isSelectableCategoryValue(normalizedLabel)) {
      missing += row.value;
      continue;
    }
    rows.push({
      ...row,
      normalizedLabel,
      displayLabel: formatCategoryValue(field, normalizedLabel),
    });
  }

  const reportedTotal =
    totalBacklinks != null && totalBacklinks > 0
      ? totalBacklinks
      : missing + rows.reduce((sum, row) => sum + row.value, 0);
  const missingSentence =
    missing > 0 ? missingCategorySentence(field, missing, reportedTotal) : null;

  if (rows.length === 0) {
    return {
      mode: "not-provided",
      rows,
      max: null,
      notice: null,
      sentence:
        missingSentence ?? `${CATEGORY_MISSING_LABELS[field]} for this profile`,
    };
  }

  if (rows.length === 1) {
    return {
      mode: "sentence",
      rows,
      max: null,
      notice: missingSentence,
      sentence: singleCategorySentence(field, rows[0]),
    };
  }

  return {
    mode: "meters",
    rows,
    max: Math.max(...rows.map((row) => row.value)),
    notice: missingSentence,
    sentence: null,
  };
}

type ActiveCategoryFilter = {
  field: CategoryFilterField;
  rawValue: string;
  /** e.g. `Site type: Blogs` — the chip's visible text. */
  chipLabel: string;
};

/** The applied drill-downs, in a stable order, for the chip strip. */
export function activeCategoryFilters(
  values: Pick<BacklinksTabFilterValues, CategoryFilterField>,
): ActiveCategoryFilter[] {
  const active: ActiveCategoryFilter[] = [];
  for (const field of CATEGORY_FILTER_FIELDS) {
    const rawValue = values[field].trim();
    if (rawValue === "") continue;
    active.push({
      field,
      rawValue,
      chipLabel: `${CATEGORY_FILTER_LABELS[field]}: ${formatCategoryValue(field, rawValue)}`,
    });
  }
  return active;
}

/** True when any drill-down is applied, which forces the All links view. */
export function hasActiveCategoryFilter(
  values: Pick<BacklinksTabFilterValues, CategoryFilterField>,
): boolean {
  return activeCategoryFilters(values).length > 0;
}
