import { z } from "zod";

/**
 * URL state for GSC Insights, kept out of the page so the route schema and the
 * tab strip cannot disagree about which tabs exist -- and so the normalisation
 * below is testable without a router.
 */

/** The tab set, declared once as a tuple: the strip renders it, the schema
 *  validates against it, and `Tab` is derived from it. */
export const SEARCH_PERFORMANCE_TAB_VALUES = [
  "striking",
  "ctr",
  "content",
  "queries",
  "pages",
] as const;

export type Tab = (typeof SEARCH_PERFORMANCE_TAB_VALUES)[number];

/** What the tab opens on when the URL says nothing. */
export const DEFAULT_SEARCH_PERFORMANCE_TAB: Tab = "striking";

/**
 * `q` is the query an inbound link is asking about -- SEO Opportunities'
 * "Review" on a CTR row already knows it -- and `tab` is the panel that
 * answers it. Without both, that link landed on the striking-distance tab with
 * the query dropped, which is neither the row it was sent about nor the
 * diagnosis it was made from.
 *
 * `.catch(undefined)` on each field rather than a failing parse: a stale or
 * hand-edited URL must degrade to the default view, never blank the tab. An
 * empty `q` is dropped for the same reason it is elsewhere -- it is a filter
 * nobody asked for, and leaving it in the URL makes every share carry it.
 */
export const searchPerformanceSearchSchema = z.object({
  q: z.string().min(1).optional().catch(undefined),
  tab: z.enum(SEARCH_PERFORMANCE_TAB_VALUES).optional().catch(undefined),
});

/** The tab as it should be written back to the URL. The default is omitted so
 *  simply opening the tab does not rewrite its own address bar, and so a
 *  copied link is only ever specific about a choice the user actually made. */
export function tabSearchValue(tab: Tab): Tab | undefined {
  return tab === DEFAULT_SEARCH_PERFORMANCE_TAB ? undefined : tab;
}
