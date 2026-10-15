import type { KeywordControlsValues } from "@/client/features/keywords/hooks/useKeywordControlsForm";
import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { parseKeywordInput } from "./keywordControllerActions";

/**
 * A keyword search the user ran in this mounted session: what they submitted,
 * the geo captured at that moment, and the run nonce its query is cached
 * under. Keeping every run (not just the last) is what lets a search tab show
 * ITS results -- straight from the query cache -- instead of whichever search
 * happened to run last.
 */
export type KeywordSessionRun<TGeo> = {
  values: KeywordControlsValues;
  geo: TGeo;
  nonce: number;
};

/** The search the URL (the active tab) names. */
type KeywordSearchScope = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

/**
 * How many runs a session remembers for tab switching. Each one pins a cached
 * result set, and the tab strip holds far fewer tabs than this.
 */
export const MAX_KEYWORD_SESSION_RUNS = 20;

export function recordSessionRun<TGeo>(
  runs: readonly KeywordSessionRun<TGeo>[],
  run: KeywordSessionRun<TGeo>,
): KeywordSessionRun<TGeo>[] {
  return [...runs, run].slice(-MAX_KEYWORD_SESSION_RUNS);
}

/**
 * The newest session run that answers the search the URL names: the same
 * settings, with the URL's keyword among the seeds it was submitted with (one
 * submission of several keywords opens a tab per keyword, and the run answers
 * each of them). Null when the URL names no search, or names one this session
 * never ran -- which must stay visibly unrun, never borrow another search's
 * rows.
 */
export function findSessionRun<TGeo>(
  runs: readonly KeywordSessionRun<TGeo>[],
  scope: KeywordSearchScope | null,
): KeywordSessionRun<TGeo> | null {
  const keyword = scope?.keyword.trim();
  if (!scope || !keyword) return null;
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (
      run &&
      run.values.locationCode === scope.locationCode &&
      run.values.resultLimit === scope.resultLimit &&
      run.values.mode === scope.mode &&
      run.values.clickstream === scope.clickstream &&
      parseKeywordInput(run.values.keyword).includes(keyword)
    ) {
      return run;
    }
  }
  return null;
}

/**
 * Whether a stored past run may stand in for what the URL names. With no
 * search in the URL, any run may fill the view; with one, only a run for that
 * keyword -- otherwise another search's rows would sit under this tab. Stored
 * labels join a multi-keyword run's seeds with ", ", which parseKeywordInput
 * splits back apart.
 */
export function restoredRunAnswers(keywordInput: string, label: string) {
  const keyword = keywordInput.trim();
  return !keyword || parseKeywordInput(label).includes(keyword);
}
