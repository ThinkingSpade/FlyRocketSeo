import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  fetchGoogleReviewsResult,
  type GoogleBusinessInfoItem,
  type GoogleReviewItem,
} from "@/server/lib/dataforseo/business";

/** Business profiles change slowly; refresh twice a day. */
const LOCAL_SEO_TTL_SECONDS = 12 * 60 * 60;

const businessProfileSchema = z.object({
  found: z.boolean(),
  title: z.string().nullable(),
  category: z.string().nullable(),
  additionalCategories: z.array(z.string()),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
  rating: z.number().nullable(),
  reviewsCount: z.number().nullable(),
  isClaimed: z.boolean().nullable(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  mainImage: z.string().nullable(),
  cid: z.string().nullable(),
  placeId: z.string().nullable(),
  fetchedAt: z.string(),
});

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

function readRatingValue(item: GoogleBusinessInfoItem): number | null {
  return typeof item.rating?.value === "number" ? item.rating.value : null;
}

function readReviewsCount(item: GoogleBusinessInfoItem): number | null {
  const votes = item.rating?.votes_count;
  return typeof votes === "number" ? votes : null;
}

function mapBusinessProfile(
  item: GoogleBusinessInfoItem | null,
  fetchedAt: string,
): BusinessProfile {
  if (!item) {
    return {
      found: false,
      title: null,
      category: null,
      additionalCategories: [],
      address: null,
      phone: null,
      url: null,
      domain: null,
      rating: null,
      reviewsCount: null,
      isClaimed: null,
      description: null,
      logo: null,
      mainImage: null,
      cid: null,
      placeId: null,
      fetchedAt,
    };
  }
  return {
    found: true,
    title: item.title ?? null,
    category: item.category ?? null,
    additionalCategories: item.additional_categories ?? [],
    address: item.address ?? null,
    phone: item.phone ?? null,
    url: item.url ?? null,
    domain: item.domain ?? null,
    rating: readRatingValue(item),
    reviewsCount: readReviewsCount(item),
    isClaimed: item.is_claimed ?? null,
    description: item.description ?? null,
    logo: item.logo ?? null,
    mainImage: item.main_image ?? null,
    cid: item.cid ?? null,
    placeId: item.place_id ?? null,
    fetchedAt,
  };
}

async function getBusinessProfile(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<BusinessProfile> {
  const keyword = input.keyword.trim();

  const cacheKey = await buildCacheKey("local-seo:business-profile", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword: keyword.toLowerCase(),
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = businessProfileSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.found) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const item = await dataforseo.business.myBusinessInfo({
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const profile = mapBusinessProfile(item, new Date().toISOString());
  if (profile.found) {
    void setCached(cacheKey, profile, LOCAL_SEO_TTL_SECONDS).catch((error) => {
      console.error("local-seo.business-profile.cache-write failed:", error);
    });
  }

  return profile;
}

async function startReviewsFetch(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<{ taskId: string }> {
  const dataforseo = createDataforseoClient(billingCustomer);
  return dataforseo.business.postReviewsTask({
    keyword: input.keyword.trim(),
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth: input.depth,
  });
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
    };

function mapReviewItem(item: GoogleReviewItem): ReviewRow {
  return {
    reviewId: item.review_id ?? null,
    rating: typeof item.rating?.value === "number" ? item.rating.value : null,
    author: item.profile_name ?? null,
    timeAgo: item.time_ago ?? null,
    timestamp: item.timestamp ?? null,
    text: item.review_text ?? null,
    ownerAnswer: item.owner_answer ?? null,
    reviewUrl: item.review_url ?? null,
  };
}

async function getReviewsResult(taskId: string): Promise<ReviewsOutcome> {
  // Collection is free and unmetered; completed payloads are served straight
  // from DataForSEO, which retains finished tasks for collection.
  const outcome = await fetchGoogleReviewsResult(taskId);
  if (outcome.status !== "completed") return outcome;
  return {
    status: "completed",
    rating: outcome.rating,
    reviewsCount: outcome.reviewsCount,
    // SDK review items are class instances, which server functions can't
    // serialise — flatten to plain rows.
    items: outcome.items.map(mapReviewItem),
  };
}

export const LocalSeoService = {
  getBusinessProfile,
  startReviewsFetch,
  getReviewsResult,
} as const;
