import { startReviewsFetch, getReviewsResult } from "./localReviews";
import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  businessScopeSchema,
  fiveStarValue,
  observedCount,
  type BusinessScope,
} from "./localSeoContracts";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { GoogleBusinessInfoItem } from "@/server/lib/dataforseo/business";

/** Business profiles change slowly; refresh twice a day. */
const LOCAL_SEO_TTL_SECONDS = 12 * 60 * 60;
const PROJECT_BUSINESS_CONTEXT_TTL_SECONDS = 365 * 24 * 60 * 60;

const businessProfileSchema = z.object({
  contractVersion: z.literal(2),
  source: z.literal("DataForSEO Business Data"),
  scope: businessScopeSchema.nullable(),
  found: z.boolean(),
  title: z.string().nullable(),
  category: z.string().nullable(),
  // Nullable, not defaulted: DataForSEO omits this field rather than
  // returning an empty array when it has nothing to say about additional
  // categories, and collapsing that omission to `[]` here would be
  // indistinguishable from a business that genuinely has none by the time
  // gbpAudit.ts sees it -- see buildCategoryCheck's null-vs-empty handling,
  // which this field exists to feed honestly.
  additionalCategories: z.array(z.string()).nullable(),
  address: z.string().nullable(),
  city: z.string().nullable().default(null),
  region: z.string().nullable().default(null),
  latitude: z.number().finite().min(-90).max(90).nullable().default(null),
  longitude: z.number().finite().min(-180).max(180).nullable().default(null),
  phone: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
  rating: fiveStarValue,
  reviewsCount: observedCount,
  isClaimed: z.boolean().nullable(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  mainImage: z.string().nullable(),
  cid: z.string().nullable(),
  placeId: z.string().nullable(),
  fetchedAt: z.iso.datetime(),
});

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

function readRatingValue(item: GoogleBusinessInfoItem): number | null {
  const value = item.rating?.value;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 5
    ? value
    : null;
}

function readReviewsCount(item: GoogleBusinessInfoItem): number | null {
  const votes = item.rating?.votes_count;
  return typeof votes === "number" && Number.isSafeInteger(votes) && votes >= 0
    ? votes
    : null;
}

/** Exported (rather than left module-private like the rest of this file's
 *  helpers) so its null-vs-empty mapping for `additionalCategories` --
 *  the one place this service turns DataForSEO's own item shape into ours
 *  -- can be tested directly instead of only through a full, mocked
 *  `getBusinessProfile` call. */
export function mapBusinessProfile(
  item: GoogleBusinessInfoItem | null,
  fetchedAt: string,
  scope: BusinessScope | null = null,
): BusinessProfile {
  if (!item) {
    return {
      contractVersion: 2,
      source: "DataForSEO Business Data",
      scope,
      found: false,
      title: null,
      category: null,
      additionalCategories: null,
      address: null,
      city: null,
      region: null,
      latitude: null,
      longitude: null,
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
    contractVersion: 2,
    source: "DataForSEO Business Data",
    scope,
    found: true,
    title: item.title ?? null,
    category: item.category ?? null,
    // `?? null`, not `?? []`: DataForSEO not returning this field at all
    // (`undefined`) means we can't see it, which is a different fact from
    // DataForSEO returning it as an empty array (the business genuinely has
    // no additional categories). Only the latter is a real finding.
    additionalCategories: item.additional_categories ?? null,
    address: item.address ?? null,
    city: item.address_info?.city ?? null,
    region: item.address_info?.region ?? null,
    latitude:
      typeof item.latitude === "number" &&
      Number.isFinite(item.latitude) &&
      Math.abs(item.latitude) <= 90
        ? item.latitude
        : null,
    longitude:
      typeof item.longitude === "number" &&
      Number.isFinite(item.longitude) &&
      Math.abs(item.longitude) <= 180
        ? item.longitude
        : null,
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

const cachedBusinessContextSchema = z.object({
  keyword: z.string(),
  profile: businessProfileSchema,
});

async function projectBusinessContextKey(input: {
  organizationId: string;
  projectId: string;
}) {
  return buildCacheKey("local-seo:project-business-context", input);
}

async function cacheProjectBusinessContext(
  input: { projectId: string; keyword: string },
  profile: BusinessProfile,
  billingCustomer: BillingCustomerContext,
) {
  const cacheKey = await projectBusinessContextKey({
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
  });
  await setCached(
    cacheKey,
    { keyword: input.keyword, profile },
    PROJECT_BUSINESS_CONTEXT_TTL_SECONDS,
  );
}

async function getCachedBusinessContext(
  projectId: string,
  billingCustomer: BillingCustomerContext,
) {
  const cacheKey = await projectBusinessContextKey({
    organizationId: billingCustomer.organizationId,
    projectId,
  });
  const cached = cachedBusinessContextSchema.safeParse(
    await getCached(cacheKey),
  );
  return cached.success &&
    cached.data.profile.scope?.organizationId ===
      billingCustomer.organizationId &&
    cached.data.profile.scope.projectId === projectId
    ? cached.data
    : null;
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
  const scope = {
    ...input,
    keyword,
    organizationId: billingCustomer.organizationId,
  };

  const cacheKey = await buildCacheKey("local-seo:business-profile", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword: keyword.toLowerCase(),
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = businessProfileSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    JSON.stringify(cached.data.scope) ===
      JSON.stringify(businessScopeSchema.parse(scope))
  ) {
    await cacheProjectBusinessContext(
      { projectId: input.projectId, keyword },
      cached.data,
      billingCustomer,
    ).catch((error) => {
      console.error("local-seo.project-context.cache-write failed:", error);
    });
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const item = await dataforseo.business.myBusinessInfo({
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const profile = mapBusinessProfile(item, new Date().toISOString(), scope);
  await Promise.all([
    setCached(cacheKey, profile, LOCAL_SEO_TTL_SECONDS),
    cacheProjectBusinessContext(
      { projectId: input.projectId, keyword },
      profile,
      billingCustomer,
    ),
  ]).catch((error) => {
    console.error("local-seo.business-profile.cache-write failed:", error);
  });

  return profile;
}

export const LocalSeoService = {
  getBusinessProfile,
  getCachedBusinessContext,
  startReviewsFetch,
  getReviewsResult,
} as const;
