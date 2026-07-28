import { Link2, Map, SearchX, Users } from "lucide-react";
import {
  DEFAULT_COMPETITORS_PAGE_SIZE,
  DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  DEFAULT_LINK_GAP_PAGE_SIZE,
  type CompetitorsTab,
  type KeywordGapMode,
} from "@/types/schemas/competitors";
import type { AnalyzePreviewItem } from "@/client/components/AnalyzeDomainPrompt";

/**
 * Static copy and lookup tables for `CompetitorsPage` -- none of it depends on
 * props or state, so it lives here instead of pushing that file over the
 * project's per-file line cap.
 */
export const GAP_MODE_LABELS: Record<KeywordGapMode, string> = {
  missing: "Missing (they rank, you don't)",
  shared: "Shared (you both rank)",
  advantage: "Advantage (you rank, they don't)",
};

export const TAB_PAGE_SIZES: Record<CompetitorsTab, number> = {
  competitors: DEFAULT_COMPETITORS_PAGE_SIZE,
  gap: DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  links: DEFAULT_LINK_GAP_PAGE_SIZE,
};

export const COMPETITORS_TABS: Array<{ tab: CompetitorsTab; label: string }> = [
  { tab: "competitors", label: "Competitors" },
  { tab: "gap", label: "Keyword Gap" },
  { tab: "links", label: "Link Gap" },
];

export const COMPETITORS_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: Users,
    title: "Organic rivals",
    description: "Domains ranking for the same keywords, by overlap",
  },
  {
    icon: Map,
    title: "Positioning map",
    description: "Keywords vs traffic, bubble-sized by shared keywords",
  },
  {
    icon: SearchX,
    title: "Keyword gap",
    description: "What they rank for that you don't — your content roadmap",
  },
  {
    icon: Link2,
    title: "Link gap",
    description: "Sites linking to them but not to you",
  },
];
