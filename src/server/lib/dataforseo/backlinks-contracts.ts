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

function matchesIndexedTargets(raw: unknown, targets: string[]): boolean {
  if (!isRecord(raw) || Object.keys(raw).length !== targets.length)
    return false;
  return Object.entries(raw).every(
    ([key, target]) =>
      /^[1-9]\d*$/.test(key) &&
      Number(key) <= targets.length &&
      typeof target === "string" &&
      targetIdentity(target) === targetIdentity(targets[Number(key) - 1]),
  );
}

function matchesExcludedTargets(raw: unknown, targets: string[]): boolean {
  if (!Array.isArray(raw)) return false;
  const values: unknown[] = raw;
  if (!values.every((target): target is string => typeof target === "string"))
    return false;
  const expected = new Set(targets.map(targetIdentity));
  const actual = new Set(values.map(targetIdentity));
  return (
    actual.size === expected.size &&
    [...actual].every((target) => expected.has(target))
  );
}

export function parseScopedBacklinksItems<T extends z.ZodType>(
  endpoint: string,
  task: DataforseoTaskLike,
  schema: T,
  scope: {
    target?: string;
    targets?: string[];
    excludeTargets?: string[];
    includeSubdomains?: boolean;
    excludeInternalBacklinks?: boolean;
    rankScale?: "one_hundred";
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
    // Both declared request metadata and result metadata bind the index-to-
    // target mapping. Exclusions define the owned target's link gap, so a
    // different exclusion cannot be saved as evidence of missing owned links.
    for (const reported of [task.data, first].filter(isRecord)) {
      for (const [field, expected] of [
        ["include_subdomains", scope.includeSubdomains],
        ["exclude_internal_backlinks", scope.excludeInternalBacklinks],
        ["rank_scale", scope.rankScale],
      ] as const) {
        if (
          expected !== undefined &&
          reported[field] != null &&
          reported[field] !== expected
        )
          throw fail(`returned mismatched ${field}`);
      }
      if (
        reported.targets != null &&
        !matchesIndexedTargets(reported.targets, scope.targets)
      )
        throw fail("returned a mismatched intersection scope");
      if (
        scope.excludeTargets &&
        reported.exclude_targets != null &&
        !matchesExcludedTargets(reported.exclude_targets, scope.excludeTargets)
      )
        throw fail("returned mismatched excluded targets");
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
