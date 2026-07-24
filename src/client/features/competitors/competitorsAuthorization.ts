import { createMeteredRunKey } from "@/client/lib/useMeteredQuery";
import {
  DEFAULT_COMPETITORS_PAGE_SIZE,
  DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  DEFAULT_LINK_GAP_PAGE_SIZE,
  type CompetitorsTab,
  type KeywordGapMode,
} from "@/types/schemas/competitors";

const PAGE_SIZE_BY_TAB: Record<CompetitorsTab, number> = {
  competitors: DEFAULT_COMPETITORS_PAGE_SIZE,
  gap: DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  links: DEFAULT_LINK_GAP_PAGE_SIZE,
};

export function buildCompetitorsAuthorizationKey(
  projectId: string,
  state: {
    target: string;
    competitor: string;
    tab: CompetitorsTab;
    mode: KeywordGapMode;
    page: number;
  },
): string {
  return createMeteredRunKey(
    projectId,
    state.target.trim(),
    state.competitor.trim(),
    state.tab,
    state.mode,
    state.page,
    PAGE_SIZE_BY_TAB[state.tab],
  );
}
