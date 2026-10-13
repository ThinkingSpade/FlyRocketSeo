import { z } from "zod";
import { isNoResultsTask, isRecord, type DataforseoTaskLike } from "./envelope";
import { rejectLabsContract } from "./labs-contract";
import { providerCount } from "@/shared/provider-observations";
import {
  keywordEstimate,
  keywordPosition,
  keywordScore,
  keywordRatio,
} from "@/shared/keyword-observations";

const count = z.unknown().transform(providerCount);
const estimate = z.unknown().transform(keywordEstimate);
const position = z.unknown().transform(keywordPosition);
const score = z.unknown().transform(keywordScore);
const averagePosition = z.unknown().transform((value) => {
  const observed = keywordEstimate(value);
  return observed !== null && observed > 0 ? observed : null;
});
const organic = z
  .object({
    count,
    etv: estimate,
    pos_1: count,
    pos_2_3: count,
    pos_4_10: count,
    pos_11_20: count,
    pos_21_30: count,
    pos_31_40: count,
    pos_41_50: count,
    pos_51_60: count,
    pos_61_70: count,
    pos_71_80: count,
    pos_81_90: count,
    pos_91_100: count,
  })
  .passthrough();
const metrics = z
  .object({
    organic: organic.nullable().optional(),
    paid: organic.nullable().optional(),
  })
  .passthrough();
export const competitorItemSchema = z
  .object({
    domain: z.string().min(1),
    avg_position: averagePosition,
    intersections: count,
    full_domain_metrics: metrics.nullable().optional(),
  })
  .passthrough();
export const serpCompetitorItemSchema = z
  .object({
    domain: z.string().min(1),
    avg_position: averagePosition,
    median_position: averagePosition,
    etv: estimate,
    keywords_count: count,
    keywords_positions: z
      .record(z.string(), z.array(position).nullable())
      .nullable()
      .optional(),
  })
  .passthrough();
export const siteKeywordItemSchema = z
  .object({
    keyword: z.string().min(1),
    keyword_info: z
      .object({
        search_volume: count,
        cpc: estimate,
        competition: z.unknown().transform(keywordRatio),
      })
      .passthrough()
      .nullable()
      .optional(),
    keyword_properties: z
      .object({ keyword_difficulty: score })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
export const intersectionItemSchema = z
  .object({
    keyword_data: siteKeywordItemSchema,
    first_domain_serp_element: z
      .object({ rank_absolute: position })
      .passthrough()
      .nullable()
      .optional(),
    second_domain_serp_element: z
      .object({ rank_absolute: position })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
export const difficultyItemSchema = z
  .object({
    keyword: z.string().min(1),
    keyword_difficulty: score,
  })
  .passthrough();
export const intentItemSchema = z
  .object({
    keyword: z.string().min(1),
    keyword_intent: z
      .object({
        label: z.string().nullable().optional(),
        probability: z.unknown().transform(keywordRatio),
      })
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
export const trafficItemSchema = z
  .object({
    target: z.string().min(1),
    etv: estimate,
    metrics: metrics.nullable().optional(),
  })
  .passthrough();
export const subdomainItemSchema = z
  .object({
    subdomain: z.string().min(1),
    metrics: metrics.nullable().optional(),
  })
  .passthrough();
export const historicalItemSchema = z
  .object({
    year: z.number().nullable().optional(),
    month: z.number().nullable().optional(),
    metrics: metrics.nullable().optional(),
  })
  .passthrough();

type Scope = {
  locationCode?: number;
  languageCode: string;
  target?: string;
  target1?: string;
  target2?: string;
  keywords?: string[];
  targets?: string[];
};
/** Only defined request scopes are compared; Search Intent is language-only. */
export function competitorTaskItems<T extends z.ZodType>(
  task: DataforseoTaskLike,
  scope: Scope,
  schema: T,
): z.output<T>[] {
  if (isNoResultsTask(task)) return [];
  const result = task.result?.[0];
  if (!isRecord(result)) rejectLabsContract(task, "missing result");
  const assertScope = (record: Record<string, unknown>) => {
    if (
      (scope.locationCode !== undefined &&
        record.location_code != null &&
        record.location_code !== scope.locationCode) ||
      (record.language_code != null &&
        record.language_code !== scope.languageCode) ||
      (scope.target !== undefined &&
        record.target != null &&
        record.target !== scope.target) ||
      (scope.target1 !== undefined &&
        (record.target1 ?? record.target_1) != null &&
        (record.target1 ?? record.target_1) !== scope.target1) ||
      (scope.target2 !== undefined &&
        (record.target2 ?? record.target_2) != null &&
        (record.target2 ?? record.target_2) !== scope.target2)
    )
      rejectLabsContract(task, "different comparison scope");
  };
  assertScope(result);
  if (
    !Array.isArray(result.items) &&
    !(result.items == null && result.total_count === 0)
  )
    rejectLabsContract(task, "missing items");
  const parsed = z.array(schema).safeParse(result.items ?? []);
  if (!parsed.success) rejectLabsContract(task, "invalid items");
  for (const item of parsed.data) {
    if (!isRecord(item)) rejectLabsContract(task, "invalid item");
    assertScope(item);
    const itemKeyword = item.keyword;
    if (
      scope.keywords &&
      typeof itemKeyword === "string" &&
      !scope.keywords.some(
        (keyword) =>
          keyword.trim().toLowerCase() === itemKeyword.trim().toLowerCase(),
      )
    )
      rejectLabsContract(task, "unrequested keyword");
    if (
      scope.targets &&
      typeof item.target === "string" &&
      !scope.targets.includes(item.target)
    )
      rejectLabsContract(task, "unrequested target");
  }
  return parsed.data;
}
