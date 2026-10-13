import {
  serpSnapshotItemSchema,
  localSerpItemSchema,
  requireSerpItems,
  requireSerpScope,
  requireOrganicRanks,
  type SerpLiveItem,
} from "./serp-contracts";
export type { SerpLiveItem } from "./serp-contracts";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseoLimits";
import {
  SerpApiStopCrawlOnMatchInfo,
  SerpGoogleLocalFinderLiveAdvancedRequestInfo,
  SerpGoogleMapsLiveAdvancedRequestInfo,
  SerpGoogleOrganicLiveAdvancedRequestInfo,
  SerpGoogleOrganicTaskPostRequestInfo,
} from "dataforseo-client";
import { serpApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  DataforseoChargedTaskError,
  isNoResultsTask,
  isRecord,
  parseTaskItems,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

/** DataForSEO bills SERPs in pages of 10; depth outside 10-100 is rejected. */
function clampSerpDepth(depth: number): number {
  return Math.min(100, Math.max(10, depth));
}

/**
 * Stop crawling SERP pages once the target domain is found — DataForSEO only
 * bills the pages crawled, so a page-1 ranking at depth 20 costs one page
 * instead of two. Matching is restricted to organic results and uses
 * with_subdomains, mirroring buildRankCheckResult exactly: without
 * find_targets_in, a sitelink or PAA mention could stop the crawl before the
 * domain's organic listing and record a false "not ranking".
 */
function stopCrawlOnTarget(targetDomain: string) {
  return {
    stop_crawl_on_match: [
      new SerpApiStopCrawlOnMatchInfo({
        match_value: targetDomain,
        match_type: "with_subdomains",
      }),
    ],
    find_targets_in: ["organic"],
  };
}

export async function fetchLiveSerp(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<SerpLiveItem[]>> {
  const response = await serpApi().googleOrganicLiveAdvanced([
    new SerpGoogleOrganicLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      device: "desktop",
      os: "windows",
      depth: 100,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  if (isNoResultsTask(task)) {
    // The documented 40102 response retains metadata with null items and zero
    // counts. Legacy explicit empty arrays also establish absence; missing
    // payloads still lack evidence.
    const first = task.result?.[0];
    const isEmpty = Array.isArray(task.result) && task.result.length === 0;
    const hasEmptyMetadata =
      isRecord(first) &&
      first.items === null &&
      first.items_count === 0 &&
      first.se_results_count === 0;
    if (
      !isEmpty &&
      !hasEmptyMetadata &&
      (!isRecord(first) || !Array.isArray(first.items))
    ) {
      throw new DataforseoChargedTaskError(
        "DataForSEO SERP returned missing observation items",
        buildTaskBilling(task),
      );
    }
  }
  requireSerpItems(task);
  requireSerpScope(task, {
    keyword: input.keyword,
    location_code: input.locationCode,
    language_code: input.languageCode,
    device: "desktop",
  });
  return {
    data: parseTaskItems(
      "google-organic-live-advanced",
      task,
      serpSnapshotItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

export interface RankCheckResult {
  keywordId: string;
  keyword: string;
  position: number | null;
  url: string | null;
  serpFeatures: string[];
}

function buildRankCheckResult(
  input: { keywordId: string; keyword: string; targetDomain: string },
  items: SerpLiveItem[],
): RankCheckResult {
  const target = input.targetDomain.toLowerCase();
  const organicMatch = items.find((item) => {
    if (item.type !== "organic" || item.domain == null) return false;
    const domain = item.domain.toLowerCase();
    return domain === target || domain.endsWith(`.${target}`);
  });

  return {
    keywordId: input.keywordId,
    keyword: input.keyword,
    position: organicMatch
      ? (organicMatch.rank_absolute ?? organicMatch.rank_group ?? null)
      : null,
    url: organicMatch?.url ?? null,
    serpFeatures: [...new Set(items.map((item) => item.type).filter(Boolean))],
  };
}

export async function fetchRankCheckSerp(input: {
  keyword: string;
  keywordId: string;
  locationCode: number;
  languageCode: string;
  device: "desktop" | "mobile";
  targetDomain: string;
  depth: number;
}): Promise<DataforseoApiResponse<RankCheckResult>> {
  const depth = clampSerpDepth(input.depth);
  const response = await serpApi().googleOrganicLiveAdvanced([
    new SerpGoogleOrganicLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      device: input.device,
      os: input.device === "desktop" ? "windows" : "android",
      depth,
      ...stopCrawlOnTarget(input.targetDomain),
    }),
  ]);

  // "No Search Results" (40102) is valid for obscure/new keywords — treat as an
  // empty result set rather than failing the whole rank-tracking run.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  requireSerpItems(task);
  requireSerpScope(task, {
    keyword: input.keyword,
    location_code: input.locationCode,
    language_code: input.languageCode,
    device: input.device,
  });
  const items = parseTaskItems(
    "google-organic-live-advanced",
    task,
    serpSnapshotItemSchema,
  );

  requireOrganicRanks(task, items);

  return {
    data: buildRankCheckResult(input, items),
    billing: buildTaskBilling(task),
  };
}

// ---------------------------------------------------------------------------
// Task-queue rank checks (scheduled runs). DataForSEO's standard queue costs
// ~30% of the live endpoint; tasks complete in ~5 minutes on average. The flow
// is task_post (charged) -> poll task_get (free) -> live fallback for
// stragglers, orchestrated by the rank check workflow.
// ---------------------------------------------------------------------------

export interface RankCheckTaskInput {
  keyword: string;
  keywordId: string;
  device: "desktop" | "mobile";
}

export interface PostedRankCheckTask extends RankCheckTaskInput {
  taskId: string;
}

export async function postRankCheckTasks(input: {
  tasks: RankCheckTaskInput[];
  locationCode: number;
  languageCode: string;
  depth: number;
  targetDomain: string;
}): Promise<DataforseoApiResponse<PostedRankCheckTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }
  const depth = clampSerpDepth(input.depth);
  const response = await serpApi().googleOrganicTaskPost(
    input.tasks.map(
      (task) =>
        new SerpGoogleOrganicTaskPostRequestInfo({
          keyword: task.keyword,
          location_code: input.locationCode,
          language_code: input.languageCode,
          device: task.device,
          os: task.device === "desktop" ? "windows" : "android",
          depth,
          // Queued tasks are billed provisionally at full depth at post time;
          // task_get later reports the reduced actual cost when the crawl
          // stopped early. We meter customers on the post-time amount —
          // collection-time metering is a possible future optimization.
          ...stopCrawlOnTarget(input.targetDomain),
          // Echoed back on the response entry and task_get; used to map a
          // DataForSEO task id back to our keyword without relying on order.
          tag: `${task.keywordId}:${task.device}`,
        }),
    ),
  );

  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_post failed",
    );
  }

  // One response entry per submitted task; accepted entries have status 20100
  // "Task Created" and their own cost (charged at post time). Cost is summed
  // over every entry — accepted or not — so anything DataForSEO charged is
  // metered. Rejected entries get no posted task; the workflow falls back to
  // the live endpoint for any keyword/device pair missing from the result.
  const byTag = new Map(
    input.tasks.map((task) => [`${task.keywordId}:${task.device}`, task]),
  );
  const posted: PostedRankCheckTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const tag: unknown = entry.data?.tag;
    const task = typeof tag === "string" ? byTag.get(tag) : undefined;
    if (entry.status_code !== 20100 || !entry.id || !task) {
      console.warn(
        `dataforseo.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    posted.push({ ...task, taskId: entry.id });
  }

  return {
    data: posted,
    billing: {
      path: ["v3", "serp", "google", "organic", "task_post"],
      costUsd,
    },
  };
}

type RankCheckTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; result: RankCheckResult };

// Task lifecycle codes meaning "not done yet": Task Created / Task Handed /
// Task In Queue.
const TASK_IN_PROGRESS_STATUS_CODES = new Set([20100, 40601, 40602]);

/**
 * Collect one queued task's result. Deliberately not metered and not wrapped
 * in the billing envelope: collection is free (the task was charged at
 * task_post), and the task_get response carries the task's settled cost
 * (reduced when stop_crawl_on_match ended the crawl early) — running it
 * through the metering seam would charge the customer twice.
 */
export async function fetchRankCheckTaskResult(input: {
  taskId: string;
  keywordId: string;
  keyword: string;
  targetDomain: string;
  locationCode: number;
  languageCode: string;
  device: "desktop" | "mobile";
  depth: number;
}): Promise<RankCheckTaskOutcome> {
  const response = await serpApi().googleOrganicTaskGetAdvanced(input.taskId);
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  // The task ID and reported scope belong to the queued observation, not the
  // current configuration. Validate before even an empty result can become a
  // successful snapshot. This collector remains a free GET outside metering.
  if (task.id != null && task.id !== input.taskId) {
    throw new DataforseoChargedTaskError(
      "DataForSEO queued SERP returned a different task ID",
      buildTaskBilling(task),
    );
  }
  requireSerpScope(task, {
    keyword: input.keyword,
    location_code: input.locationCode,
    language_code: input.languageCode,
    device: input.device,
    depth: clampSerpDepth(input.depth),
  });

  if (
    task.status_code !== undefined &&
    TASK_IN_PROGRESS_STATUS_CODES.has(task.status_code)
  ) {
    return { status: "pending" };
  }

  if (task.status_code !== 20000) {
    // "No Search Results" is valid for obscure/new keywords — same treatment
    // as the live path's treatNoResultsAsEmpty.
    if (!isNoResultsTask(task)) {
      return {
        status: "failed",
        message:
          task.status_message || `DataForSEO task failed (${task.status_code})`,
      };
    }
    return {
      status: "completed",
      result: buildRankCheckResult(input, []),
    };
  }

  requireSerpItems(task);
  const items = parseTaskItems(
    "google-organic-task-get-advanced",
    task,
    serpSnapshotItemSchema,
  );
  requireOrganicRanks(task, items);
  return { status: "completed", result: buildRankCheckResult(input, items) };
}

export async function fetchLocalSerp(input: {
  keyword: string;
  locationCoordinate?: string;
  languageCode: string;
  searchType: "maps" | "local_finder";
  device: "desktop" | "mobile";
  depth: number;
  searchPlaces?: boolean;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const os = input.device === "desktop" ? "windows" : "android";

  // Maps and Local Finder return different SDK item models; both carry an index
  // signature, so the typed items assign cleanly to the generic row shape.
  if (input.searchType === "maps") {
    const response = await serpApi().googleMapsLiveAdvanced([
      new SerpGoogleMapsLiveAdvancedRequestInfo({
        keyword: input.keyword,
        location_coordinate: input.locationCoordinate,
        language_code: input.languageCode,
        device: input.device,
        os,
        depth: input.depth,
        search_places: input.searchPlaces,
      }),
    ]);
    const task = assertOk(response, { treatNoResultsAsEmpty: true });
    requireSerpItems(task);
    requireSerpScope(task, {
      keyword: input.keyword,
      language_code: input.languageCode,
      device: input.device,
      location_coordinate: input.locationCoordinate,
    });
    return {
      data: parseTaskItems(
        "google-maps-live-advanced",
        task,
        localSerpItemSchema.refine(
          (item) =>
            (item.rank_group ?? item.rank_absolute) != null &&
            (item.rank_group ?? item.rank_absolute)! <= input.depth,
          "Missing or outside-depth local rank",
        ),
      ),
      billing: buildTaskBilling(task),
    };
  }

  const response = await serpApi().googleLocalFinderLiveAdvanced([
    new SerpGoogleLocalFinderLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      device: input.device,
      os,
      depth: input.depth,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  requireSerpItems(task);
  requireSerpScope(task, {
    keyword: input.keyword,
    language_code: input.languageCode,
    device: input.device,
    location_coordinate: input.locationCoordinate,
  });
  return {
    data: parseTaskItems(
      "google-local-finder-live-advanced",
      task,
      localSerpItemSchema.refine(
        (item) =>
          (item.rank_group ?? item.rank_absolute) != null &&
          (item.rank_group ?? item.rank_absolute)! <= input.depth,
        "Missing or outside-depth local rank",
      ),
    ),
    billing: buildTaskBilling(task),
  };
}
