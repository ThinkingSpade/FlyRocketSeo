import { createMeteredRunKey } from "@/client/lib/useMeteredQuery";
import type {
  PromptExplorerModel,
  WebSearchCountryCode,
} from "@/types/schemas/ai-search";

/**
 * The identity of one AI-search run, as a comparable string.
 *
 * Both AI tabs hold their authorization in component state and their answers
 * in a `staleTime: Infinity` cache, so nothing about changing the URL can
 * clear either one. "Recent searches" cleared `q`/`c` and the form and left
 * the results sitting underneath it -- and so did browser-back, and so did
 * clicking a different history row, which showed the previous lookup's
 * answer under the new lookup's form. Deriving what to display from these
 * keys is what ties the results to the URL instead of to the click that
 * produced them.
 *
 * These are display decisions only. Authorization to SPEND still comes from
 * an explicit submit and nothing here can grant it.
 */

type BrandLookupRunInput = {
  query: string;
  competitors: string[];
};

export function brandLookupRunKey(input: BrandLookupRunInput): string {
  return createMeteredRunKey(
    input.query.trim(),
    // Sorted, because competitor order is not part of the question: the URL
    // preserves whatever order was typed, and a stored history row can hand
    // the same set back in another one.
    input.competitors
      .map((competitor) => competitor.trim())
      .filter((competitor) => competitor !== "")
      .toSorted(),
  );
}

export type PromptExplorerRunInput = {
  prompt: string;
  highlightBrand: string;
  models: PromptExplorerModel[];
  webSearch: boolean;
  webSearchCountryCode: WebSearchCountryCode;
};

/**
 * Also the metered-run key Prompt Explorer authorizes against. One function
 * for both jobs on purpose: an answer can only stay on screen while the URL
 * still describes the run that was paid for.
 */
export function promptExplorerRunKey(
  projectId: string,
  values: PromptExplorerRunInput,
): string {
  return createMeteredRunKey(
    projectId,
    values.prompt.trim(),
    values.models.toSorted(),
    values.webSearch,
    values.webSearchCountryCode,
    values.highlightBrand.trim(),
  );
}

/**
 * Whether what the user authorized is still what the URL is asking for.
 *
 * False during the render between submitting and the router writing the new
 * params -- which is correct: the request is in flight then, so the tab shows
 * its loading state rather than the previous run's answer.
 */
export function isRunOnScreen(
  authorizedKey: string | null,
  urlKey: string,
): boolean {
  return authorizedKey !== null && authorizedKey === urlKey;
}
