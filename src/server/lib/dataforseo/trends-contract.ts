import { z } from "zod";
import {
  buildTaskBilling,
  DataforseoChargedTaskError,
  isNoResultsTask,
  isRecord,
  type DataforseoTaskLike,
} from "./envelope";

type TrendsRequestScope = {
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
  dateFrom?: string;
  dateTo?: string;
  useClickstream?: boolean;
};
const keyword = (value: string) => value.trim().toLowerCase();
export function rejectTrendsContract(
  task: DataforseoTaskLike,
  detail: string,
): never {
  throw new DataforseoChargedTaskError(
    `DataForSEO returned invalid trend/volume evidence (${detail})`,
    buildTaskBilling(task),
  );
}
function assertScope(
  task: DataforseoTaskLike,
  value: unknown,
  scope: TrendsRequestScope,
) {
  if (!isRecord(value)) return;
  if (
    value.location_code != null &&
    value.location_code !== (scope.locationCode ?? 0)
  )
    rejectTrendsContract(task, "different location");
  for (const [field, expected] of [
    ["language_code", scope.languageCode],
    ["date_from", scope.dateFrom],
    ["date_to", scope.dateTo],
    ["use_clickstream", scope.useClickstream],
  ] as const) {
    if (
      value[field] != null &&
      expected !== undefined &&
      value[field] !== expected
    )
      rejectTrendsContract(task, `different ${field}`);
  }
  if (
    value.keywords != null &&
    (!Array.isArray(value.keywords) ||
      value.keywords.length !== scope.keywords.length ||
      value.keywords.some(
        (entry: unknown, index: number) =>
          typeof entry !== "string" ||
          keyword(entry) !== keyword(scope.keywords[index]),
      ))
  )
    rejectTrendsContract(task, "different requested keywords");
}

/** A success needs an actual result/list; only explicit no-results may omit it. */
export function parseTrendsItems<T extends z.ZodTypeAny>(
  task: DataforseoTaskLike,
  schema: T,
  scope: TrendsRequestScope,
): Array<z.infer<T>> {
  assertScope(task, task.data, scope);
  if (isNoResultsTask(task)) return [];
  const first = task.result?.[0];
  if (!isRecord(first)) rejectTrendsContract(task, "missing result");
  assertScope(task, first, scope);
  if (
    !Array.isArray(first.items) &&
    !(first.items == null && first.items_count === 0)
  )
    rejectTrendsContract(task, "missing items");
  const parsed = z.array(schema).safeParse(first.items ?? []);
  if (!parsed.success) rejectTrendsContract(task, "invalid items");
  for (const item of parsed.data) assertScope(task, item, scope);
  return parsed.data;
}

export function assertTrendsGraphColumns(
  task: DataforseoTaskLike,
  items: Array<{
    keywords?: string[] | null;
    averages?: Array<number | null> | null;
    data?: Array<{ values?: Array<number | null> | null }> | null;
  }>,
  requested: string[],
) {
  if (items.length > 1)
    rejectTrendsContract(task, "ambiguous duplicate graphs");
  if (isRecord(task.data)) {
    const request = task.data;
    if (
      (request.type != null && request.type !== "web") ||
      (request.category_code != null && request.category_code !== 0) ||
      (request.item_types != null &&
        (!Array.isArray(request.item_types) ||
          request.item_types.length !== 1 ||
          request.item_types[0] !== "google_trends_graph"))
    )
      rejectTrendsContract(task, "different Trends source/filter");
  }
  for (const item of items) {
    if (
      !item.keywords ||
      item.keywords.length !== requested.length ||
      item.keywords.some(
        (entry, index) => keyword(entry) !== keyword(requested[index]),
      )
    )
      rejectTrendsContract(task, "different graph columns");
    if (
      (item.averages?.length && item.averages.length !== requested.length) ||
      item.data?.some(
        (point) =>
          point.values != null && point.values.length !== requested.length,
      )
    )
      rejectTrendsContract(task, "misaligned graph values");
  }
}

function decodedKeyword(value: string) {
  try {
    return keyword(decodeURIComponent(value.replace(/\+/g, " ")));
  } catch {
    return keyword(value);
  }
}
/** Global volume documents %## decoding and plus-as-space, not autocorrection. */
export function assertGlobalVolumeKeywords(
  task: DataforseoTaskLike,
  items: Array<{ keyword: string }>,
  requested: string[],
) {
  const allowed = new Set(requested.map(decodedKeyword));
  for (const item of items)
    if (!allowed.has(decodedKeyword(item.keyword)))
      rejectTrendsContract(task, "unrequested global keyword");
}
