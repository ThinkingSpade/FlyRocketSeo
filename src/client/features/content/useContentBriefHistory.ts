import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";

export interface ContentBriefHistoryItem {
  keyword: string;
  locationCode: number;
  timestamp: number;
}

const MAX_HISTORY = 12;

const historyItemSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  timestamp: z.number(),
});

const historyCodec = jsonCodec(z.array(historyItemSchema));

/** Recently built briefs, stored locally per project — powers the tab's
 *  empty state so past work is one click away. */
export function useContentBriefHistory(projectId: string) {
  const { history, isLoaded, addItem, removeItem } = useLocalHistoryStore<
    ContentBriefHistoryItem,
    Omit<ContentBriefHistoryItem, "timestamp">
  >({
    storageKey: `content-brief-history:${projectId}`,
    maxItems: MAX_HISTORY,
    parse: (raw) => {
      const parsed = historyCodec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    isSameItem: (existing, next) =>
      existing.keyword === next.keyword &&
      existing.locationCode === next.locationCode,
    createItem: (item) => ({ ...item, timestamp: Date.now() }),
    getItemKey: (item) => item.timestamp,
  });

  return {
    history,
    historyLoaded: isLoaded,
    addBrief: addItem,
    removeBrief: removeItem,
  };
}
