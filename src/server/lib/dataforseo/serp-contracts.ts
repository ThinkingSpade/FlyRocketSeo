import { z } from "zod";
import {
  buildTaskBilling,
  DataforseoChargedTaskError,
  isRecord,
  isNoResultsTask,
  type DataforseoTaskLike,
} from "./envelope";

// Kept as a hand-written schema: the SDK's BaseSerpApiElementItem type omits
// etv / estimated_paid_traffic_cost / backlinks_info / rank_changes, which we
// rely on. The fields survive deserialization (the SDK copies unknown keys), so
// validating here is both our type-safety guard and how we read those fields.
export const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().int().safe().positive().nullable().optional(),
    rank_absolute: z.number().int().safe().positive().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    etv: z.number().finite().nonnegative().nullable().catch(null).optional(),
    estimated_paid_traffic_cost: z.number().finite().nonnegative().nullable().catch(null).optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().int().safe().nonnegative().nullable().catch(null).optional(),
        backlinks: z.number().int().safe().nonnegative().nullable().catch(null).optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rank_changes: z
      .object({
        previous_rank_absolute: z.number().int().safe().positive().nullable().catch(null).optional(),
        is_new: z.boolean().nullable().optional(),
        is_up: z.boolean().nullable().optional(),
        is_down: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type SerpLiveItem = z.infer<typeof serpSnapshotItemSchema>;

// A successful task without observed items is missing evidence. Only the
// provider's explicit "No Search Results" response establishes an empty SERP.
export function requireSerpItems(task: DataforseoTaskLike): void {
  if (isNoResultsTask(task)) return;
  const first = task.result?.[0];
  if (!isRecord(first) || !Array.isArray(first.items)) {
    throw new DataforseoChargedTaskError(
      "DataForSEO SERP returned missing observation items",
      buildTaskBilling(task),
    );
  }
}

export function requireSerpScope(
  task: DataforseoTaskLike,
  expected: Record<string, unknown>,
): void {
  const first = task.result?.[0];
  if (!isRecord(first)) return;
  for (const [key, value] of Object.entries(expected)) {
    if (first[key] != null && first[key] !== value) {
      throw new DataforseoChargedTaskError(
        `DataForSEO SERP returned mismatched ${key}`,
        buildTaskBilling(task),
      );
    }
  }
}

export function requireOrganicRanks(
  task: DataforseoTaskLike,
  items: SerpLiveItem[],
): void {
  if (
    items.some(
      (item) =>
        item.type === "organic" &&
        (!item.domain || (item.rank_absolute ?? item.rank_group) == null),
    )
  ) {
    throw new DataforseoChargedTaskError(
      "DataForSEO rank check returned incomplete organic observations",
      buildTaskBilling(task),
    );
  }
}

export const localSerpItemSchema = z
  .object({
    type: z.string().min(1),
    rank_group: z.number().int().safe().positive().nullable().optional(),
    rank_absolute: z.number().int().safe().positive().nullable().optional(),
    title: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .passthrough();
