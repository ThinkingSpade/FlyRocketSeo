import { Lightbulb } from "lucide-react";
import type { SeedSuggestion } from "./types";

/**
 * A suggestion as this component needs it: `SeedSuggestion` minus the
 * requirement on `weight`. `SuggestionChips` only ever renders suggestions in
 * the order it is given and never re-sorts, so it has no use for the number
 * that ranks them — `weight` stays required on `SeedSuggestion` itself
 * because the ranking model still depends on it. Making it optional here
 * (rather than importing `SeedSuggestion` verbatim) lets callers that never
 * ranked anything — a plain `{ value, hint }` list — satisfy this prop
 * without inventing a number.
 */
type ChipSuggestion = Omit<SeedSuggestion, "weight"> & { weight?: number };

/**
 * Prefill candidates as chips, each showing the number that justifies it.
 *
 * The number is not decoration: a bare list of words asks the user to guess
 * why these and not others. Generalized from the dashboard's seed field so
 * every tab offers suggestions in the same shape.
 */
export function SuggestionChips({
  suggestions,
  value,
  onSelect,
  disabled = false,
}: {
  suggestions: ChipSuggestion[];
  /** The field's current value, so the matching chip reads as selected. */
  value: string;
  onSelect: (next: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;

  // Most callers' field holds a single value, but Keyword Trends' holds a
  // comma-separated list of up to `MAX_TRENDS_KEYWORDS` -- splitting on `,`
  // and testing membership handles both without a per-caller opt-in: a
  // single-value field just splits into a one-element list, so this is the
  // exact-match check it always was, while a list field highlights every
  // member it currently holds instead of only ever matching when exactly one
  // is present. Filtering blanks means an empty (or all-commas) field never
  // marks a chip active.
  const currentValues = value
    .trim()
    .toLowerCase()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Lightbulb className="size-3.5 shrink-0 text-base-content/40" />
      {suggestions.map((suggestion) => {
        const active = currentValues.includes(
          suggestion.value.trim().toLowerCase(),
        );
        return (
          <button
            key={suggestion.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(suggestion.value)}
            title={suggestion.hint}
            className={`btn btn-xs h-auto min-h-0 gap-1 py-1 font-normal ${
              active ? "btn-primary" : "btn-ghost border border-base-300"
            }`}
          >
            <span className="max-w-[14rem] truncate">{suggestion.value}</span>
            <span
              className={
                active
                  ? "text-primary-content/70"
                  : "text-base-content/45 tabular-nums"
              }
            >
              {suggestion.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
