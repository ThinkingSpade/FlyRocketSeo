import type { HandoffEntry, HandoffKind } from "./handoffStore";
import type { SeedSuggestion } from "./types";

/**
 * Decides what goes in a field when several sources could fill it.
 *
 * Pure and total: every branch returns, and an exhausted chain returns the
 * empty string rather than throwing, because a field with no good default is a
 * normal state, not an error.
 *
 * Resolving a value never triggers a fetch. The caller puts the result in an
 * input; the user still presses the button.
 */

/**
 * Which level of the chain supplied the value. Deliberately not exported: no
 * caller needs to name it, and the return type carries it structurally. knip
 * fails the build on exports nothing imports.
 */
type PrefillSource =
  | "search-param"
  | "handoff"
  | "last-run"
  | "suggestion"
  | "project"
  | "none";

type ResolveInput = {
  /** Which sort of value this field holds, so a domain never lands in a
   *  keyword box. */
  kind: HandoffKind;
  /** From the URL. Explicit and shareable, so it always wins. */
  searchParam: string | null;
  handoff: HandoffEntry | null;
  /** The input this tab last ran, from analysis_runs. */
  lastRun: string | null;
  /** Ranked, highest first. Only the top one is used as a value. */
  suggestions: SeedSuggestion[];
  /** The project's domain, for domain-shaped fields. */
  projectDefault: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolvePrefill(input: ResolveInput): {
  value: string;
  source: PrefillSource;
} {
  const searchParam = clean(input.searchParam);
  if (searchParam) return { value: searchParam, source: "search-param" };

  // A handoff carrying the wrong sort of value is skipped, not an error: the
  // user simply moved between tabs that trade in different things.
  const handoff =
    input.handoff && input.handoff.kind === input.kind
      ? clean(input.handoff.value)
      : null;
  if (handoff) return { value: handoff, source: "handoff" };

  const lastRun = clean(input.lastRun);
  if (lastRun) return { value: lastRun, source: "last-run" };

  const suggestion = clean(input.suggestions[0]?.value);
  if (suggestion) return { value: suggestion, source: "suggestion" };

  const projectDefault = clean(input.projectDefault);
  if (projectDefault) return { value: projectDefault, source: "project" };

  return { value: "", source: "none" };
}
