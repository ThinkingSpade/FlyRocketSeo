import { z } from "zod";
import { env } from "cloudflare:workers";
import { buildCacheKey, getRunPayload } from "@/server/lib/r2-cache";
import { AppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { GoogleReviewItem } from "@/server/lib/dataforseo/business";
import {
  businessScopeSchema,
  fiveStarValue,
  observedCount,
  reviewTimestamp,
  type BusinessScope,
} from "./localSeoContracts";

export async function startReviewsFetch(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<{ taskId: string; receiptSaved: boolean; warning?: string }> {
  const dataforseo = createDataforseoClient(billingCustomer);
  const posted = await dataforseo.business.postReviewsTask({
    keyword: input.keyword.trim(),
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth: input.depth,
  });
  const scope = businessScopeSchema.parse({
    ...input,
    keyword: input.keyword.trim(),
    organizationId: billingCustomer.organizationId,
  });
  const receipt = {
    contractVersion: 2 as const,
    taskId: posted.taskId,
    scope,
    depth: input.depth,
    postedAt: new Date().toISOString(),
    result: null,
  };
  try {
    const key = await reviewTaskKey(
      input.projectId,
      posted.taskId,
      billingCustomer,
    );
    await env.R2.put(`analysis-runs/${key}`, JSON.stringify(receipt), {
      httpMetadata: { contentType: "application/json" },
    });
    return { taskId: posted.taskId, receiptSaved: true };
  } catch (error) {
    console.error("local-seo.reviews.receipt-write failed:", error);
    return {
      taskId: posted.taskId,
      receiptSaved: false,
      warning: `Reviews task ${posted.taskId} was posted and charged, but its ownership receipt could not be saved. Collection is blocked; keep this task ID for recovery. Starting again creates another paid task.`,
    };
  }
}

type ReviewRow = {
  reviewId: string | null;
  rating: number | null;
  author: string | null;
  timeAgo: string | null;
  timestamp: string | null;
  text: string | null;
  ownerAnswer: string | null;
  reviewUrl: string | null;
};

type ReviewsOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | {
      status: "completed";
      rating: number | null;
      reviewsCount: number | null;
      items: ReviewRow[];
      source: "DataForSEO Google Reviews";
      scope: BusinessScope;
      fetchedAt: string;
      depth: number;
    };

function mapReviewItem(item: GoogleReviewItem): ReviewRow {
  return {
    reviewId: item.review_id ?? null,
    rating: fiveStarValue.catch(null).parse(item.rating?.value ?? null),
    author: item.profile_name ?? null,
    timeAgo: item.time_ago ?? null,
    timestamp: reviewTimestamp(item.timestamp),
    text: item.review_text ?? null,
    ownerAnswer: item.owner_answer ?? null,
    reviewUrl: item.review_url ?? null,
  };
}

const reviewRowSchema = z.object({
  reviewId: z.string().nullable(),
  rating: fiveStarValue,
  author: z.string().nullable(),
  timeAgo: z.string().nullable(),
  timestamp: z.iso.datetime().nullable(),
  text: z.string().nullable(),
  ownerAnswer: z.string().nullable(),
  reviewUrl: z.string().nullable(),
});
const completedReviewsSchema = z.object({
  status: z.literal("completed"),
  rating: fiveStarValue,
  reviewsCount: observedCount,
  items: z.array(reviewRowSchema),
  source: z.literal("DataForSEO Google Reviews"),
  scope: businessScopeSchema,
  fetchedAt: z.iso.datetime(),
  depth: z.number().int().positive(),
});
const reviewReceiptSchema = z.object({
  contractVersion: z.literal(2),
  taskId: z.string(),
  scope: businessScopeSchema,
  depth: z.number().int().positive(),
  postedAt: z.iso.datetime(),
  result: completedReviewsSchema.nullable(),
});

function reviewTaskKey(
  projectId: string,
  taskId: string,
  customer: BillingCustomerContext,
) {
  return buildCacheKey("local-seo:reviews-task", {
    organizationId: customer.organizationId,
    projectId,
    taskId,
  });
}

export async function getReviewsResult(
  input: { projectId: string; taskId: string },
  billingCustomer: BillingCustomerContext,
): Promise<ReviewsOutcome> {
  const key = await reviewTaskKey(
    input.projectId,
    input.taskId,
    billingCustomer,
  );
  const raw = await getRunPayload(key);
  let value: unknown = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    /* Invalid receipts do not authorize collection. */
  }
  const receipt = reviewReceiptSchema.safeParse(value);
  if (
    !receipt.success ||
    receipt.data.taskId !== input.taskId ||
    receipt.data.scope.organizationId !== billingCustomer.organizationId ||
    receipt.data.scope.projectId !== input.projectId
  ) {
    throw new AppError(
      "FORBIDDEN",
      "This review task has no valid ownership receipt for the current project. It may belong to another project or predate scoped collection; no provider collection was made.",
    );
  }
  if (receipt.data.result) return receipt.data.result;
  // Collection is free and unmetered; completed payloads are served straight
  // from DataForSEO, which retains finished tasks for collection. Loaded lazily
  // to keep the DataForSEO SDK out of the Worker startup graph.
  const { fetchGoogleReviewsResult } =
    await import("@/server/lib/dataforseo/business");
  const outcome = await fetchGoogleReviewsResult(input.taskId);
  if (outcome.status !== "completed") return outcome;
  const result = {
    status: "completed" as const,
    rating: outcome.rating,
    reviewsCount: outcome.reviewsCount,
    // SDK review items are class instances, which server functions can't
    // serialise — flatten to plain rows.
    items: outcome.items.map(mapReviewItem),
    source: "DataForSEO Google Reviews" as const,
    scope: receipt.data.scope,
    fetchedAt: new Date().toISOString(),
    depth: receipt.data.depth,
  };
  await env.R2.put(
    `analysis-runs/${key}`,
    JSON.stringify({ ...receipt.data, result }),
    { httpMetadata: { contentType: "application/json" } },
  );
  return result;
}
