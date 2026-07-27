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

  const current = value.trim().toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Lightbulb className="size-3.5 shrink-0 text-base-content/40" />
      {suggestions.map((suggestion) => {
        const active = suggestion.value.toLowerCase() === current;
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
