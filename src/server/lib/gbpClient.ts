import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gbp";
import type { GbpCallToActionType } from "@/client/features/local-seo/gbpPostSchedule";

/**
 * Thin REST client for the THREE Google Business Profile write surfaces this
 * feature uses. Deliberately three different hosts, matching Google's own API
 * split (they migrated most Business Profile management off the legacy v4 "My
 * Business API" between 2022-2023, but posts stayed on it):
 *  - mybusinessaccountmanagement.googleapis.com -- which accounts this grant
 *    can act on.
 *  - mybusinessbusinessinformation.googleapis.com -- locations, listing field
 *    patches, and the category taxonomy.
 *  - mybusiness.googleapis.com (v4, legacy) -- local posts. Still the current
 *    documented endpoint for post creation as of this writing.
 * Modeled on gscClient.ts: same token-resolution shape, same request<T>
 * wrapper, same two-error-class split (transport/permission vs. no-usable-
 * token) -- but reading from GBP_OAUTH_PROVIDER_ID's SEPARATE grant, never
 * GSC's.
 */

const ACCOUNT_MANAGEMENT_BASE =
  "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFORMATION_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const MY_BUSINESS_V4_BASE = "https://mybusiness.googleapis.com/v4";

/** A GBP REST call returned a non-2xx status. `status` drives user-facing
 *  messaging (see messageForStatus). */
export class GbpApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GbpApiError";
  }
}

/** No fresh access token could be minted -- the user revoked the grant, or
 *  the refresh token expired. */
export class GbpTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GbpTokenError";
  }
}

// Only GbpCategorySuggestion below is imported by name elsewhere
// (GbpWriteService.ts's SearchCategoriesOutcome) -- every other type here is
// consumed structurally by this module's own returned client object, so
// callers never need to name them.
type GbpAccount = { name: string; accountName: string };
type GbpLocationSummary = { name: string; title: string };

type GbpLocalPostInput = {
  summary: string;
  callToAction?: { actionType: GbpCallToActionType; url?: string };
  media?: Array<{ mediaFormat: "PHOTO"; sourceUrl: string }>;
};

type GbpCategoryRef = { name: string; displayName?: string };

type GbpLocationPatch = {
  profile?: { description: string };
  categories?: {
    primaryCategory?: GbpCategoryRef;
    additionalCategories?: GbpCategoryRef[];
  };
};

export type GbpCategorySuggestion = { name: string; displayName: string };

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Google Business Profile denied access to this location (grant revoked, or missing permission on this listing).";
  }
  if (status === 429) {
    return "Google Business Profile rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Google Business Profile location not found. It may have been unlinked or deleted on Google's side.";
  }
  return `Google Business Profile API error (${status}): ${body.slice(0, 300)}`;
}

/** Free-to-call Google Business Profile client -- like GSC, this is first-party
 *  data/actions with no per-call DataForSEO cost. Tokens are minted (and
 *  auto-refreshed) by Better Auth from the connector's stored
 *  google-business-profile grant, never GSC's. */
export function createGbpClient(opts: { userId: string }) {
  // Mirrors gscClient.ts's own newest-grant resolution exactly (see its doc
  // comment): a user can hold more than one Google account under this
  // provider over time, and Better Auth's providerId-only lookup would
  // silently pin to the oldest one.
  async function findNewestGrantAccountId(): Promise<string | undefined> {
    try {
      const rows = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(
          and(
            eq(account.userId, opts.userId),
            eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
          ),
        )
        .orderBy(desc(account.createdAt))
        .limit(1);
      return rows[0]?.accountId;
    } catch {
      return undefined;
    }
  }

  async function getToken(): Promise<string> {
    const grantAccountId = await findNewestGrantAccountId();
    let result: { accessToken?: string } | undefined;
    try {
      result = await getAuth().api.getAccessToken({
        body: {
          providerId: GBP_OAUTH_PROVIDER_ID,
          userId: opts.userId,
          ...(grantAccountId ? { accountId: grantAccountId } : {}),
        },
      });
    } catch (error) {
      throw new GbpTokenError(
        "Could not mint a Business Profile access token (grant revoked or expired).",
        error,
      );
    }
    if (!result?.accessToken) {
      throw new GbpTokenError(
        "Business Profile returned no access token (grant revoked or expired).",
      );
    }
    return result.accessToken;
  }

  async function request<T>(
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const token = await getToken();
    const hasBody = init?.body !== undefined;
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GbpApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    return (await response.json()) as T;
  }

  return {
    /** Account Management API `accounts.list` -- the accounts this grant can
     *  act on. Almost always exactly one for a single-business connector. */
    async listAccounts(): Promise<GbpAccount[]> {
      const data = await request<{ accounts?: GbpAccount[] }>(
        `${ACCOUNT_MANAGEMENT_BASE}/accounts`,
      );
      return data.accounts ?? [];
    },

    /** Business Information API `accounts.locations.list`, restricted to the
     *  two fields the location picker needs. */
    async listLocations(accountName: string): Promise<GbpLocationSummary[]> {
      const data = await request<{ locations?: GbpLocationSummary[] }>(
        `${BUSINESS_INFORMATION_BASE}/${accountName}/locations?readMask=name,title`,
      );
      return data.locations ?? [];
    },

    /** My Business v4 `accounts.locations.localPosts.create` -- still the
     *  current documented endpoint for post creation:
     *  https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create
     *  Its `parent` path parameter MUST be the composed
     *  "accounts/{accountId}/locations/{locationId}" form -- unlike the
     *  Business Information API (getLocation/patchLocation below), which
     *  takes the bare "locations/{locationId}" form. The two pieces are
     *  passed separately (rather than one pre-joined string) so this is the
     *  one place that knows how to combine them, matching how they're stored
     *  separately on gbp_connections (locationName + accountName). Returns
     *  the created post's own resource name for
     *  gbp_scheduled_posts.published_post_id. */
    async createLocalPost(
      location: { accountName: string; locationName: string },
      post: GbpLocalPostInput,
    ): Promise<{ publishedPostName: string }> {
      const data = await request<{ name: string }>(
        `${MY_BUSINESS_V4_BASE}/${location.accountName}/${location.locationName}/localPosts`,
        {
          method: "POST",
          body: { languageCode: "en", topicType: "STANDARD", ...post },
        },
      );
      return { publishedPostName: data.name };
    },

    /** Business Information API `locations.get`, restricted to whatever
     *  `readMask` names. Used for a read-modify-write before patching a
     *  masked *array* field (additionalCategories) -- Google's patch replaces
     *  the whole array named by the mask, so appending one category means
     *  reading the current list first, never guessing or reconstructing it
     *  from a different data source's category names. */
    async getLocation(
      locationName: string,
      readMask: string[],
    ): Promise<{
      categories?: {
        primaryCategory?: GbpCategoryRef;
        additionalCategories?: GbpCategoryRef[];
      };
    }> {
      const params = new URLSearchParams({ readMask: readMask.join(",") });
      return request(
        `${BUSINESS_INFORMATION_BASE}/${locationName}?${params.toString()}`,
      );
    },

    /** Business Information API `locations.patch`. `updateMask` MUST list
     *  exactly the top-level field paths present in `fields` (e.g.
     *  "profile.description", "categories") -- Google patches only what the
     *  mask names, ignoring everything else in the body. */
    async patchLocation(
      locationName: string,
      fields: GbpLocationPatch,
      updateMask: string[],
    ): Promise<void> {
      await request(
        `${BUSINESS_INFORMATION_BASE}/${locationName}?updateMask=${encodeURIComponent(updateMask.join(","))}`,
        { method: "PATCH", body: fields },
      );
    },

    /** Business Information API `categories.list` -- resolves a free-text
     *  name (what a user types) to Google's fixed category taxonomy IDs,
     *  which is what `categories.primaryCategory`/`additionalCategories`
     *  actually require (a bare display name is rejected). There is no
     *  `categories:search` method -- `regionCode`, `languageCode`, and `view`
     *  are all REQUIRED query parameters:
     *  https://developers.google.com/my-business/reference/businessinformation/rest/v1/categories/list
     *  `view: "BASIC"` is enough -- GbpCategorySuggestion only needs
     *  `displayName` and the category id (both included in BASIC); `FULL`
     *  would also return service-type metadata this feature never uses. */
    async searchCategories(input: {
      query: string;
      regionCode: string;
      languageCode: string;
    }): Promise<GbpCategorySuggestion[]> {
      const params = new URLSearchParams({
        regionCode: input.regionCode,
        languageCode: input.languageCode,
        view: "BASIC",
        filter: `displayName=${input.query}`,
      });
      const data = await request<{ categories?: GbpCategorySuggestion[] }>(
        `${BUSINESS_INFORMATION_BASE}/categories?${params.toString()}`,
      );
      return data.categories ?? [];
    },
  };
}
