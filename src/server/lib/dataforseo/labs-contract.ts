import { z } from "zod";
import {
  buildTaskBilling,
  DataforseoChargedTaskError,
  isNoResultsTask,
  isRecord,
  type DataforseoTaskLike,
} from "./envelope";

type Scope = {
  locationCode: number;
  languageCode: string;
  target?: string;
  keyword?: string;
  keywords?: string[];
};

export function rejectLabsContract(
  task: DataforseoTaskLike,
  detail: string,
): never {
  throw new DataforseoChargedTaskError(
    `DataForSEO returned invalid keyword evidence (${detail})`,
    buildTaskBilling(task),
  );
}

export function assertKeywordScope(
  task: DataforseoTaskLike,
  item: unknown,
  scope: Scope,
  exactKeywords = false,
) {
  if (!isRecord(item)) rejectLabsContract(task, "invalid item");
  if (
    (item.location_code != null && item.location_code !== scope.locationCode) ||
    (item.language_code != null && item.language_code !== scope.languageCode) ||
    (scope.target !== undefined &&
      item.target != null &&
      item.target !== scope.target)
  )
    rejectLabsContract(task, "different target or market");
  const itemKeyword = item.keyword;
  if (
    exactKeywords &&
    itemKeyword != null &&
    (typeof itemKeyword !== "string" ||
      !scope.keywords?.some(
        (keyword) =>
          keyword.trim().toLowerCase() === itemKeyword.trim().toLowerCase(),
      ))
  )
    rejectLabsContract(task, "unrequested keyword");
}

export function labsResult(task: DataforseoTaskLike, scope: Scope) {
  if (isNoResultsTask(task)) return { items: [], total_count: 0 };
  const result = task.result?.[0];
  if (!isRecord(result)) rejectLabsContract(task, "missing result");
  assertKeywordScope(task, result, scope);
  if (
    scope.keyword &&
    result.seed_keyword != null &&
    result.seed_keyword !== scope.keyword
  )
    rejectLabsContract(task, "different seed");
  if (
    !Array.isArray(result.items) &&
    !(result.items == null && result.total_count === 0)
  )
    rejectLabsContract(task, "missing items");
  const items: unknown[] = Array.isArray(result.items) ? result.items : [];
  for (const item of items) {
    assertKeywordScope(task, item, scope);
    if (isRecord(item) && isRecord(item.keyword_data))
      assertKeywordScope(task, item.keyword_data, scope);
  }
  return result;
}

const keywordInfoSchema = z
  .object({
    search_volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    competition: z.number().nullable().optional(),
    monthly_searches: z
      .array(
        z
          .object({
            year: z.number().nullable().optional(),
            month: z.number().nullable().optional(),
            search_volume: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

export const labsKeywordItemSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    keyword_info: keywordInfoSchema.nullable().optional(),
    keyword_info_normalized_with_clickstream: keywordInfoSchema
      .nullable()
      .optional(),
    keyword_properties: z
      .object({ keyword_difficulty: z.number().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    search_intent_info: z
      .object({ main_intent: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const labsRelatedItemSchema = z
  .object({ keyword_data: labsKeywordItemSchema.nullable().optional() })
  .passthrough();
export const labsPageItemSchema = z
  .object({
    page_address: z.string().nullable().optional(),
    metrics: z
      .object({
        organic: z
          .object({
            etv: z.number().nullable().optional(),
            count: z.number().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export function validateLabsItems(
  task: DataforseoTaskLike,
  schema: z.ZodTypeAny,
  scope: Scope,
  exactKeywords = false,
) {
  const result = labsResult(task, scope);
  const parsed = z.array(schema).safeParse(result.items ?? []);
  if (!parsed.success) rejectLabsContract(task, "invalid items");
  if (exactKeywords)
    for (const item of parsed.data) assertKeywordScope(task, item, scope, true);
  return result;
}
