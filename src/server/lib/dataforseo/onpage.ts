import { z } from "zod";
import { OnPageInstantPagesRequestInfo } from "dataforseo-client";
import { onPageApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isRecord,
  isNoResultsTask,
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// Live single-URL technical audit via the On-Page API. Complements the
// homegrown SiteAuditWorkflow crawler: this checks any URL on demand (no
// crawl session) using DataForSEO's full on-page check suite.

const instantPageItemSchema = z
  .object({
    url: z.string().nullable().optional(),
    status_code: z.number().nullable().optional(),
    onpage_score: z.number().nullable().optional(),
    media_type: z.string().nullable().optional(),
    checks: z.record(z.string(), z.boolean().nullable()).nullable().optional(),
    meta: z
      .object({
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        canonical: z.string().nullable().optional(),
        internal_links_count: z.number().nullable().optional(),
        external_links_count: z.number().nullable().optional(),
        images_count: z.number().nullable().optional(),
        title_length: z.number().nullable().optional(),
        description_length: z.number().nullable().optional(),
        htags: z
          .record(z.string(), z.array(z.string()).nullable())
          .nullable()
          .optional(),
        content: z
          .object({
            plain_text_word_count: z.number().nullable().optional(),
            plain_text_rate: z.number().nullable().optional(),
            automated_readability_index: z.number().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    page_timing: z
      .object({
        time_to_interactive: z.number().nullable().optional(),
        dom_complete: z.number().nullable().optional(),
        largest_contentful_paint: z.number().nullable().optional(),
        first_input_delay: z.number().nullable().optional(),
        duration_time: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type InstantPageAuditItem = z.infer<typeof instantPageItemSchema>;

export async function fetchInstantPageAudit(input: {
  url: string;
  /** Render with a browser (JS execution); slower and pricier but accurate for SPAs. */
  enableJavascript?: boolean;
}): Promise<DataforseoApiResponse<InstantPageAuditItem | null>> {
  const response = await onPageApi().instantPages([
    new OnPageInstantPagesRequestInfo({
      url: input.url,
      enable_javascript: input.enableJavascript,
      // Load resource timing so page_timing is populated.
      enable_browser_rendering: input.enableJavascript,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const billing = buildTaskBilling(task);
  const rejectContract = () => {
    throw new DataforseoChargedTaskError(
      "Invalid DataForSEO on-page observation or request scope",
      billing,
    );
  };
  if (
    isRecord(task.data) &&
    ((task.data.url != null && task.data.url !== input.url) ||
      (task.data.enable_javascript != null &&
        task.data.enable_javascript !== (input.enableJavascript ?? false)) ||
      (task.data.enable_browser_rendering != null &&
        task.data.enable_browser_rendering !==
          (input.enableJavascript ?? false)))
  ) {
    rejectContract();
  }
  if (isNoResultsTask(task)) return { data: null, billing };
  const first: unknown = task.result?.[0];
  if (!isRecord(first) || !Array.isArray(first.items)) rejectContract();
  const items =
    isRecord(first) && Array.isArray(first.items) ? first.items : [];
  // Browser rendering can also return resources. Select the requested page
  // instead of mistaking a stylesheet/image for its content analysis.
  const item: unknown =
    items.length > 1
      ? items.find((entry) => isRecord(entry) && entry.url === input.url)
      : items[0];
  if (items.length > 1 && item === undefined) rejectContract();
  if (item === undefined) return { data: null, billing };
  // The SDK turns primitive array entries into empty model objects. A real
  // captured page has its URL; an empty model is malformed, not a no-data page.
  if (!isRecord(item) || typeof item.url !== "string" || !item.url.trim())
    rejectContract();
  const parsed = instantPageItemSchema.safeParse(item ?? {});
  if (!parsed.success) rejectContract();
  return {
    data: item != null && parsed.success ? parsed.data : null,
    billing,
  };
}
