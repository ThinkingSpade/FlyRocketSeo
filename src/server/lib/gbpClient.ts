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

/** True for a fetch-level transport failure (DNS, connection refused, a
 *  dropped connection) -- never a statement about WHY the grant itself is
 *  unusable. Exported so GbpConnectionService's own classification can reuse
 *  this exact heuristic (finding A4) rather than keeping a second, drifting
 *  copy: a network blip talking to Google is not evidence a grant was
 *  revoked, whether it happens inside getToken below or one of this
 *  client's own `request()` calls. */
export function isNetworkTransportError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /fetch failed|failed to fetch|networkerror|network request failed|load failed/i.test(
      error.message,
    )
  );
}

/**
 * What a REST call is actually trying to do -- messageForStatus reads this
 * so a status code is described honestly for THIS call, instead of every
 * endpoint sharing one location-flavored sentence regardless of what it
 * actually touched (the final wave's root cause: a 403 from accounts.list --
 * before any location is even known -- and a 401/403/404 from
 * categories.list, which has no location parameter at all, both used to
 * talk about "this location").
 */
type GbpOperation =
  | "list_accounts"
  | "list_locations"
  | "get_location"
  | "patch_location"
  | "create_post"
  | "search_categories";

/** What each operation's error text should call its subject, and whether a
 *  404 can honestly be read as "this may have been unlinked or deleted" --
 *  true only for calls that name ONE specific location resource.
 *  list_accounts/list_locations/search_categories have no single location
 *  that could have been deleted (search_categories is a taxonomy lookup with
 *  no location parameter at all), so their 404s fall through to the generic
 *  status-code message instead of asserting a cause this code cannot
 *  establish. */
const GBP_OPERATIONS: Record<
  GbpOperation,
  { subject: string; namesOneLocation: boolean }
> = {
  list_accounts: {
    subject: "your Google Business Profile accounts",
    namesOneLocation: false,
  },
  list_locations: {
    subject: "this account's Business Profile locations",
    namesOneLocation: false,
  },
  get_location: {
    subject: "this Business Profile location",
    namesOneLocation: true,
  },
  patch_location: {
    subject: "this Business Profile location",
    namesOneLocation: true,
  },
  create_post: {
    subject: "this Business Profile location",
    namesOneLocation: true,
  },
  search_categories: {
    subject: "the Business Profile category list",
    namesOneLocation: false,
  },
};

function messageForStatus(
  status: number,
  body: string,
  operation: GbpOperation,
): string {
  const { subject, namesOneLocation } = GBP_OPERATIONS[operation];
  if (status === 401 || status === 403) {
    return `Google Business Profile denied access to ${subject} (grant revoked, or missing permission).`;
  }
  if (status === 429) {
    return "Google Business Profile rate limit reached. Retry shortly.";
  }
  if (status === 404 && namesOneLocation) {
    const capitalizedSubject =
      subject.charAt(0).toUpperCase() + subject.slice(1);
    return `${capitalizedSubject} wasn't found. It may have been unlinked or deleted on Google's side.`;
  }
  return `Google Business Profile API error (${status}): ${body.slice(0, 300)}`;
}

// A sane ceiling on pages fetched per listAccounts/listLocations call
// (finding A5): both are paginated Google APIs, and stopping after page one
// risks reporting "no locations found" when the account/location genuinely
// exists on a later page. This cap exists only so a pathological response
// (one that always returns a nextPageToken) can't loop forever -- a real
// grant is expected to need at most a handful of pages, never anywhere near
// this many.
const MAX_PAGES = 20;

type PagedResult<TItem> = {
  items: TItem[];
  /** True when MAX_PAGES was reached and the LAST page fetched still
   *  returned a nextPageToken (final wave item 2, the A5 residual): more
   *  pages exist that were never fetched, so `items` is a genuine partial,
   *  not the full list. Before this, a truncated empty (or short) result was
   *  indistinguishable from "there really are none" -- callers must say
   *  enumeration was incomplete instead of asserting an absence this never
   *  established. */
  truncated: boolean;
};

/** Follows `nextPageToken` until the API stops returning one or MAX_PAGES is
 *  hit (finding A5). `fetchPage` is handed the previous page's token (or
 *  undefined for the first page) and returns that page's items plus the
 *  next token, if any -- shared by listAccounts and listLocations below so
 *  the pagination loop itself is written, and tested, exactly once. */
async function collectAllPages<TItem>(
  fetchPage: (
    pageToken: string | undefined,
  ) => Promise<{ items: TItem[]; nextPageToken?: string }>,
): Promise<PagedResult<TItem>> {
  const results: TItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items, nextPageToken } = await fetchPage(pageToken);
    results.push(...items);
    if (!nextPageToken) return { items: results, truncated: false };
    pageToken = nextPageToken;
  }
  return { items: results, truncated: true };
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
      // A network blip talking to Google's token endpoint is not evidence
      // the grant was revoked (finding A4) -- rethrow it as-is so the
      // caller's own classification (GbpConnectionService.classifyGbpError)
      // can read it as transient, the same way it already does for this
      // client's `request()` fetch calls below.
      if (isNetworkTransportError(error)) throw error;
      // We cannot tell WHY Better Auth's own call failed -- it might be a
      // revoked/expired grant, but just as easily an unrelated internal
      // error (a DB blip resolving the stored token, a bug elsewhere in the
      // auth library). Asserting "grant revoked or expired" for every
      // unclassifiable exception was a confident diagnosis this code has no
      // way to actually establish (final wave item 1) -- describe WHAT
      // happened (a token couldn't be minted), not an unproven WHY. The
      // original error is still reachable via `cause` for logs.
      throw new GbpTokenError(
        "Could not mint a Business Profile access token.",
        error,
      );
    }
    if (!result?.accessToken) {
      // Same honesty rule: a response shaped without accessToken doesn't by
      // itself prove the grant is dead -- it could just as easily be a
      // malformed/unexpected response from the token endpoint.
      throw new GbpTokenError(
        "Business Profile's token endpoint did not return an access token.",
      );
    }
    return result.accessToken;
  }

  async function request<T>(
    url: string,
    operation: GbpOperation,
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
        messageForStatus(response.status, body, operation),
        body,
      );
    }
    return (await response.json()) as T;
  }

  return {
    /** Account Management API `accounts.list` -- every account this grant
     *  can act on, following pagination to the end (finding A5). Almost
     *  always exactly one page for a single-business connector, but an empty
     *  first page with a `nextPageToken` is a real shape Google can return,
     *  not proof there are no accounts. `truncated: true` (final wave item
     *  2) means the cap was hit with a token still outstanding -- `accounts`
     *  is then a partial list, not proof this grant has none. */
    async listAccounts(): Promise<{
      accounts: GbpAccount[];
      truncated: boolean;
    }> {
      const { items, truncated } = await collectAllPages(async (pageToken) => {
        const params = pageToken
          ? `?${new URLSearchParams({ pageToken }).toString()}`
          : "";
        const data = await request<{
          accounts?: GbpAccount[];
          nextPageToken?: string;
        }>(`${ACCOUNT_MANAGEMENT_BASE}/accounts${params}`, "list_accounts");
        return {
          items: data.accounts ?? [],
          nextPageToken: data.nextPageToken,
        };
      });
      return { accounts: items, truncated };
    },

    /** Business Information API `accounts.locations.list`, restricted to the
     *  two fields the location picker needs, following pagination to the end
     *  (finding A5) -- same reasoning as listAccounts above, including
     *  `truncated` (final wave item 2). */
    async listLocations(accountName: string): Promise<{
      locations: GbpLocationSummary[];
      truncated: boolean;
    }> {
      const { items, truncated } = await collectAllPages(async (pageToken) => {
        const params = new URLSearchParams({ readMask: "name,title" });
        if (pageToken) params.set("pageToken", pageToken);
        const data = await request<{
          locations?: GbpLocationSummary[];
          nextPageToken?: string;
        }>(
          `${BUSINESS_INFORMATION_BASE}/${accountName}/locations?${params.toString()}`,
          "list_locations",
        );
        return {
          items: data.locations ?? [],
          nextPageToken: data.nextPageToken,
        };
      });
      return { locations: items, truncated };
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
        "create_post",
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
        "get_location",
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
        "patch_location",
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
        "search_categories",
      );
      return data.categories ?? [];
    },
  };
}
