import { z } from "zod";
import {
  providerCount,
  providerHundredScore,
  providerTimestamp,
} from "@/shared/provider-observations";
import {
  buildTaskBilling,
  DataforseoChargedTaskError,
  isRecord,
  parseTaskItems,
  parseTaskTotalCount,
  type DataforseoTaskLike,
} from "./envelope";

export const backlinksCountField = z
  .preprocess(providerCount, z.number().nullable())
  .optional();
export const backlinksScoreField = z
  .preprocess(providerHundredScore, z.number().nullable())
  .optional();
export const backlinksTimestampField = z
  .preprocess(providerTimestamp, z.string().nullable())
  .optional();

function targetIdentity(value: string): string {
  const trimmed = value.trim();
  // Domains ignore case/www; explicit page targets preserve path/query case.
  return trimmed.includes("/")
    ? trimmed
    : trimmed.toLowerCase().replace(/^www\./, "");
}

export function parseScopedBacklinksItems<T extends z.ZodType>(
  endpoint: string,
  task: DataforseoTaskLike,
  schema: T,
  scope: {
    target?: string;
    targets?: string[];
    intersection?: boolean;
    dateFrom?: string;
    dateTo?: string;
    groupRange?: string;
  } = {},
): Array<z.infer<T>> {
  const first = task.result?.[0];
  const fail = (message: string): DataforseoChargedTaskError => {
    return new DataforseoChargedTaskError(
      `DataForSEO ${endpoint} ${message}`,
      buildTaskBilling(task),
    );
  };
  if (!isRecord(first) || !Array.isArray(first.items))
    throw fail("returned missing observation items");
  if (
    scope.target &&
    first.target != null &&
    (typeof first.target !== "string" ||
      targetIdentity(first.target) !== targetIdentity(scope.target))
  )
    throw fail("returned evidence for another target");
  for (const [field, expected] of [
    ["date_from", scope.dateFrom],
    ["date_to", scope.dateTo],
    ["group_range", scope.groupRange],
  ]) {
    if (
      expected !== undefined &&
      first[field!] != null &&
      first[field!] !== expected
    )
      throw fail(`returned mismatched ${field}`);
  }
  const items = parseTaskItems(endpoint, task, schema);
  if (scope.targets && scope.intersection) {
    const indexes = new Set(scope.targets.map((_, index) => String(index + 1)));
    for (const item of items) {
      if (
        isRecord(item) &&
        isRecord(item.domain_intersection) &&
        Object.keys(item.domain_intersection).some((key) => !indexes.has(key))
      )
        throw fail("returned an unrequested intersection index");
    }
    if (isRecord(first.targets)) {
      for (const [key, target] of Object.entries(first.targets)) {
        if (
          !indexes.has(key) ||
          typeof target !== "string" ||
          targetIdentity(target) !==
            targetIdentity(scope.targets[Number(key) - 1])
        )
          throw fail("returned a mismatched intersection scope");
      }
    }
  } else if (scope.targets) {
    const requested = new Set(scope.targets.map(targetIdentity));
    const seen = new Set<string>();
    for (const item of items) {
      const target =
        isRecord(item) && typeof item.target === "string"
          ? targetIdentity(item.target)
          : null;
      if (!target || !requested.has(target) || seen.has(target))
        throw fail("returned unknown, duplicate or missing target identity");
      seen.add(target);
    }
  }
  return items;
}

export function backlinksTotalCount(task: DataforseoTaskLike): number | null {
  return providerCount(parseTaskTotalCount(task));
}
