import { useMemo, useState } from "react";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import type { SavedKeywordRow } from "@/types/keywords";

function isWrongFit(
  fit: ReadonlyMap<string, FitResult>,
  row: SavedKeywordRow,
): boolean {
  return fit.get(row.keyword)?.verdict === "wrong-customer";
}

/**
 * Business-fit verdicts for the saved keywords currently on screen, plus the
 * "hide wrong-fit" view toggle that mirrors Keyword Research's own.
 *
 * Free: one shared D1 read for the profile (`useProjectProfile`) and pure
 * string work over rows the page already fetched. Nothing here can reach a
 * metered provider, which is why every row can carry a verdict on render.
 *
 * Scoped to the CURRENT PAGE on purpose. Saved keywords are paginated
 * server-side and the server knows nothing about fit, so this is a view over
 * the rows in hand rather than a query predicate -- the count it reports is
 * therefore "on this page", and the control that shows it says so. The
 * portfolio strip answers the whole-set question separately, over its own
 * export read.
 */
export function useSavedKeywordsFit(
  projectId: string,
  rows: SavedKeywordRow[],
) {
  const { profile } = useProjectProfile(projectId);
  const keywords = useMemo(() => rows.map((row) => row.keyword), [rows]);
  const fit = useKeywordFit(profile, keywords);
  const [hideWrongFit, setHideWrongFit] = useState(false);

  // Counted over the UNFILTERED page: this number labels the toggle that does
  // the hiding, so counting after the filter would drop it to zero the moment
  // it was switched on.
  const wrongFitCount = useMemo(
    () => rows.filter((row) => isWrongFit(fit, row)).length,
    [fit, rows],
  );
  // Memoized because it becomes the table's `data`: a fresh array identity on
  // every render would re-key the whole table.
  const visibleRows = useMemo(
    () => (hideWrongFit ? rows.filter((row) => !isWrongFit(fit, row)) : rows),
    [fit, hideWrongFit, rows],
  );

  return { fit, hideWrongFit, setHideWrongFit, wrongFitCount, visibleRows };
}
