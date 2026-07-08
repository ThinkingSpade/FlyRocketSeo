import { z } from "zod";
import {
  BusinessDataBusinessListingsSearchLiveRequestInfo,
  BusinessDataGoogleMyBusinessInfoLiveRequestInfo,
  BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo,
  BusinessDataGoogleReviewsTaskPostRequestInfo,
  type BusinessDataBusinessListingsSearchLiveItem,
  type GoogleReviewsSearch,
  type ItemsGoogleBusinessInfo,
} from "dataforseo-client";
import { AppError } from "@/server/lib/errors";
import { businessDataApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

type BusinessListingItem = BusinessDataBusinessListingsSearchLiveItem;

export async function fetchBusinessListingsSearch(input: {
  categories?: string[];
  title?: string;
  locationCoordinate: string;
  orderBy?: string[];
  limit: number;
}): Promise<DataforseoApiResponse<BusinessListingItem[]>> {
  const response = await businessDataApi().businessListingsSearchLive([
    new BusinessDataBusinessListingsSearchLiveRequestInfo({
      categories: input.categories,
      title: input.title,
      location_coordinate: input.locationCoordinate,
      order_by: input.orderBy,
      limit: input.limit,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

// Q&A results carry both answered (`items`) and unanswered
// (`items_without_answers`) rows; the SDK types this result as `any`, so we
// validate a generic record shape and flatten both.
const questionsResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    items_without_answers: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
  })
  .passthrough();

function combinedQuestionItems(results: unknown): Record<string, unknown>[] {
  const list = Array.isArray(results) ? results : [];
  return list.flatMap((result) => {
    const parsed = questionsResultSchema.safeParse(result ?? {});
    if (!parsed.success) return [];
    return [
      ...(parsed.data.items ?? []),
      ...(parsed.data.items_without_answers ?? []),
    ];
  });
}

export async function fetchQuestionsAnswers(input: {
  keyword: string;
  locationCoordinate: string;
  languageCode: string;
  depth: number;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const response = await businessDataApi().googleQuestionsAndAnswersLive([
    new BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      depth: input.depth,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: combinedQuestionItems(task.result),
    billing: buildTaskBilling(task),
  };
}

export type GoogleBusinessInfoItem = ItemsGoogleBusinessInfo;
export type GoogleReviewItem = GoogleReviewsSearch;

export async function fetchMyBusinessInfo(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<GoogleBusinessInfoItem | null>> {
  const response = await businessDataApi().googleMyBusinessInfoLive([
    new BusinessDataGoogleMyBusinessInfoLiveRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items?.[0] ?? null,
    billing: buildTaskBilling(task),
  };
}

/**
 * Queues a Google Reviews crawl. Reviews have no live endpoint; the task is
 * charged at post time and collected for free with
 * {@link fetchGoogleReviewsResult}.
 */
export async function postGoogleReviewsTask(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth: number;
}): Promise<DataforseoApiResponse<{ taskId: string }>> {
  const response = await businessDataApi().googleReviewsTaskPost([
    new BusinessDataGoogleReviewsTaskPostRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      depth: input.depth,
      sort_by: "newest",
      // High priority halves the typical queue time; reviews are fetched
      // interactively (the UI/agent polls for the result).
      priority: 2,
    }),
  ]);
  const entry = response?.tasks?.[0];
  // task_post acceptance is 20100 "Task Created" (not 20000), so assertOk
  // doesn't apply here.
  if (!entry || entry.status_code !== 20100 || !entry.id) {
    throw new AppError(
      "INTERNAL_ERROR",
      entry?.status_message ?? "DataForSEO reviews task_post failed",
    );
  }
  return {
    data: { taskId: entry.id },
    billing: {
      path: ["v3", "business_data", "google", "reviews", "task_post"],
      costUsd: entry.cost ?? 0,
    },
  };
}

// Task lifecycle codes meaning "not done yet": Task Created / Task Handed /
// Task In Queue.
const REVIEWS_TASK_IN_PROGRESS_CODES = new Set([20100, 40601, 40602]);

type GoogleReviewsOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | {
      status: "completed";
      rating: number | null;
      reviewsCount: number | null;
      items: GoogleReviewItem[];
    };

/**
 * Collects a queued reviews task. Deliberately not metered: the task was
 * charged at post time and collection is free, so running it through the
 * metering seam would double-charge.
 */
export async function fetchGoogleReviewsResult(
  taskId: string,
): Promise<GoogleReviewsOutcome> {
  const response = await businessDataApi().googleReviewsTaskGet(taskId);
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message ?? "DataForSEO reviews task_get failed",
    );
  }
  if (REVIEWS_TASK_IN_PROGRESS_CODES.has(task.status_code ?? 0)) {
    return { status: "pending" };
  }
  if (task.status_code !== 20000) {
    return {
      status: "failed",
      message: task.status_message ?? "Reviews task failed",
    };
  }
  const result = task.result?.[0];
  return {
    status: "completed",
    rating: result?.rating?.value ?? null,
    reviewsCount: result?.reviews_count ?? null,
    items: result?.items ?? [],
  };
}
