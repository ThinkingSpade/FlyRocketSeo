import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GbpApiError,
  GbpTokenError,
  createGbpClient,
  createGbpClient as buildClient,
} from "./gbpClient";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
}));

// Same recipe as gscClient.test.ts: gbpClient resolves the newest GBP grant
// from the DB before minting a token, and its import graph reaches
// `cloudflare:workers` (via the db provider), which doesn't exist in vitest --
// stub it, and mock @/db with an empty result set so grant resolution falls
// back to the provider-only lookup these tests exercise.
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => {
  const emptyQuery = {
    from: () => emptyQuery,
    where: () => emptyQuery,
    orderBy: () => emptyQuery,
    limit: () => Promise.resolve([]),
  };
  return { db: { select: () => emptyQuery } };
});

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/** Narrows a mocked fetch call's first argument to the plain string URL
 *  gbpClient always calls fetch with -- mirrors the narrowing already used
 *  below for categories.list's URL (a `String(...)`/`as string` here would be
 *  exactly the unsafe stringification oxlint's no-base-to-string rule
 *  exists to catch, since fetch's own type is the wider RequestInfo | URL). */
function requireFetchedUrl(call: unknown[] | undefined): string {
  const url = call?.[0];
  if (typeof url !== "string") {
    throw new Error("expected gbpClient to call fetch with a string URL");
  }
  return url;
}

type GbpClient = ReturnType<typeof createGbpClient>;

/** Runs `run` against a fresh gbpClient and returns the Error it rejects
 *  with -- shared by the operation-aware-messaging and getToken-honesty
 *  describes below (final wave item 1), so each just supplies which call to
 *  make and asserts on the resulting message text, rather than repeating
 *  this same import + try/catch per test. Module-scoped (not defined inside
 *  a describe) since it captures nothing from any test's local scope. */
async function rejectedGbpCallError(
  run: (client: GbpClient) => Promise<unknown>,
): Promise<Error> {
  try {
    await run(buildClient({ userId: "u1" }));
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error("expected the gbpClient call to reject with an Error", {
      cause: error,
    });
  }
  throw new Error("expected the gbpClient call to reject");
}

describe("gbpClient", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    mocks.getAccessToken.mockResolvedValue({ accessToken: "tok_123" });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // FINDING 13: the Business Information API returns location names shaped
  // "locations/987" (bare), but the legacy v4 accounts.locations.localPosts
  // .create endpoint requires the composed "accounts/*/locations/*" parent --
  // https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create
  it("composes the accounts/*/locations/* parent for createLocalPost, even given a bare location name", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ name: "accounts/123/locations/987/localPosts/1" }),
    );
    const client = createGbpClient({ userId: "u1" });

    const result = await client.createLocalPost(
      { accountName: "accounts/123", locationName: "locations/987" },
      { summary: "New summer hours!" },
    );

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://mybusiness.googleapis.com/v4/accounts/123/locations/987/localPosts",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
    expect(result.publishedPostName).toBe(
      "accounts/123/locations/987/localPosts/1",
    );
  });

  it("sends the post body with the required languageCode/topicType defaults", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ name: "post-1" }));
    await createGbpClient({ userId: "u1" }).createLocalPost(
      { accountName: "accounts/123", locationName: "locations/987" },
      {
        summary: "Book now",
        callToAction: { actionType: "BOOK", url: "https://example.com" },
      },
    );

    const [, init] = mocks.fetch.mock.calls[0];
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as unknown)
        : null;
    expect(body).toEqual({
      languageCode: "en",
      topicType: "STANDARD",
      summary: "Book now",
      callToAction: { actionType: "BOOK", url: "https://example.com" },
    });
  });

  // FINDING 14: `categories:search` doesn't exist -- Google documents
  // `GET /v1/categories` with a REQUIRED `view` parameter --
  // https://developers.google.com/my-business/reference/businessinformation/rest/v1/categories/list
  it("calls categories.list (not categories:search), with view/regionCode/languageCode/filter", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        categories: [
          {
            name: "categories/gcid:pizza_restaurant",
            displayName: "Pizza restaurant",
          },
        ],
      }),
    );
    const categories = await createGbpClient({ userId: "u1" }).searchCategories(
      {
        query: "Pizza",
        regionCode: "US",
        languageCode: "en",
      },
    );

    const [url] = mocks.fetch.mock.calls[0];
    // A real (non-asserted) narrowing -- gbpClient always calls fetch with a
    // plain string URL, but fetch's own type is the wider RequestInfo | URL,
    // so `as string` here would be exactly the unsafe assertion oxlint's
    // no-unsafe-type-assertion rule exists to catch.
    if (typeof url !== "string") {
      throw new Error("expected gbpClient to call fetch with a string URL");
    }
    const requested = new URL(url);
    expect(requested.origin + requested.pathname).toBe(
      "https://mybusinessbusinessinformation.googleapis.com/v1/categories",
    );
    expect(requested.pathname).not.toContain(":search");
    expect(requested.searchParams.get("view")).toBe("BASIC");
    expect(requested.searchParams.get("regionCode")).toBe("US");
    expect(requested.searchParams.get("languageCode")).toBe("en");
    expect(requested.searchParams.get("filter")).toBe("displayName=Pizza");
    expect(categories).toHaveLength(1);
  });

  it("maps a non-2xx status to a GbpApiError carrying that status", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "nope" }, 404));
    await expect(
      createGbpClient({ userId: "u1" }).listAccounts(),
    ).rejects.toBeInstanceOf(GbpApiError);
    await expect(
      createGbpClient({ userId: "u1" }).listAccounts(),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws GbpTokenError when no access token can be minted", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    await expect(
      createGbpClient({ userId: "u1" }).listAccounts(),
    ).rejects.toBeInstanceOf(GbpTokenError);
  });

  // Finding A4: a network blip minting a token is not evidence the grant was
  // revoked. Before the fix, ANY exception from getAccessToken -- including
  // this one -- became a GbpTokenError asserting "revoked or expired".
  it("does not classify a network blip while minting a token as GbpTokenError", async () => {
    mocks.getAccessToken.mockRejectedValue(new TypeError("fetch failed"));
    const call = createGbpClient({ userId: "u1" }).listAccounts();
    await expect(call).rejects.not.toBeInstanceOf(GbpTokenError);
    // The original network TypeError propagates untouched, so a caller's own
    // classification (GbpConnectionService.classifyGbpError) can read it as
    // transient instead of a revoked grant.
    await expect(call).rejects.toBeInstanceOf(TypeError);
    await expect(call).rejects.toMatchObject({ message: "fetch failed" });
  });

  // Final wave item 1 (the root cause): messageForStatus used to describe
  // EVERY endpoint's error as being about "this location", regardless of
  // what actually failed. categories.list is the sharpest example -- it has
  // no location parameter at all, so calling its 404 "location not found...
  // unlinked or deleted" was simply wrong, not just imprecise.
  describe("operation-aware error messages (final wave item 1)", () => {
    it("does not describe a categories.list 401/403 as being about a location", async () => {
      mocks.fetch.mockResolvedValue(jsonResponse({ error: "nope" }, 403));
      const error = await rejectedGbpCallError((client) =>
        client.searchCategories({
          query: "Pizza",
          regionCode: "US",
          languageCode: "en",
        }),
      );
      expect(error.message.toLowerCase()).not.toContain("location");
    });

    it("does not claim a location was unlinked or deleted on a categories.list 404 (that call has no location parameter)", async () => {
      mocks.fetch.mockResolvedValue(jsonResponse({ error: "nope" }, 404));
      const error = await rejectedGbpCallError((client) =>
        client.searchCategories({
          query: "Pizza",
          regionCode: "US",
          languageCode: "en",
        }),
      );
      expect(error.message.toLowerCase()).not.toContain("unlinked or deleted");
      expect(error.message.toLowerCase()).not.toContain("location");
    });

    it("still honestly names the location for a call that actually names one (patchLocation 404)", async () => {
      mocks.fetch.mockResolvedValue(jsonResponse({ error: "nope" }, 404));
      const error = await rejectedGbpCallError((client) =>
        client.patchLocation(
          "locations/1",
          { profile: { description: "New hours" } },
          ["profile.description"],
        ),
      );
      expect(error.message.toLowerCase()).toContain("unlinked or deleted");
    });

    it("does not describe an accounts.list 403 as being about a location either", async () => {
      mocks.fetch.mockResolvedValue(jsonResponse({ error: "nope" }, 403));
      const error = await rejectedGbpCallError((client) =>
        client.listAccounts(),
      );
      expect(error.message.toLowerCase()).not.toContain("location");
    });
  });

  // Final wave item 1: any non-network exception from getAccessToken() was
  // wrapped as GbpTokenError asserting "grant revoked or expired" -- a
  // confident diagnosis this code has no way to actually establish. A DB
  // blip, a bug elsewhere in the auth library, or a genuinely dead grant all
  // looked identical here; only the wording is what's under test below (the
  // classification itself -- still GbpTokenError -- is intentionally
  // unchanged, see GbpConnectionService.classifyGbpError's own tests).
  describe("getToken honesty (final wave item 1)", () => {
    it("does not assert the grant was revoked or expired for an unclassifiable getAccessToken exception", async () => {
      mocks.getAccessToken.mockRejectedValue(
        new Error("some internal auth-library bug"),
      );
      const error = await rejectedGbpCallError((client) =>
        client.listAccounts(),
      );
      expect(error.message.toLowerCase()).not.toContain("revoked");
      expect(error.message.toLowerCase()).not.toContain("expired");
    });

    it("does not assert the grant was revoked or expired when the token response is merely missing accessToken", async () => {
      mocks.getAccessToken.mockResolvedValue({});
      const error = await rejectedGbpCallError((client) =>
        client.listAccounts(),
      );
      expect(error.message.toLowerCase()).not.toContain("revoked");
      expect(error.message.toLowerCase()).not.toContain("expired");
    });
  });

  describe("pagination (finding A5)", () => {
    it("follows nextPageToken on listAccounts even when the first page is empty", async () => {
      mocks.fetch
        .mockResolvedValueOnce(
          jsonResponse({ accounts: [], nextPageToken: "page-2" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            accounts: [{ name: "accounts/1", accountName: "Biz" }],
          }),
        );
      const result = await createGbpClient({ userId: "u1" }).listAccounts();

      expect(result).toEqual({
        accounts: [{ name: "accounts/1", accountName: "Biz" }],
        truncated: false,
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(requireFetchedUrl(mocks.fetch.mock.calls[1])).toContain(
        "pageToken=page-2",
      );
    });

    it("follows nextPageToken on listLocations even when the first page is empty", async () => {
      mocks.fetch
        .mockResolvedValueOnce(
          jsonResponse({ locations: [], nextPageToken: "page-2" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            locations: [{ name: "locations/1", title: "Store" }],
          }),
        );
      const result = await createGbpClient({ userId: "u1" }).listLocations(
        "accounts/1",
      );

      expect(result).toEqual({
        locations: [{ name: "locations/1", title: "Store" }],
        truncated: false,
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(requireFetchedUrl(mocks.fetch.mock.calls[1])).toContain(
        "pageToken=page-2",
      );
    });

    it("stops at a page cap instead of looping forever on a pathological response, and says so (final wave item 2)", async () => {
      mocks.fetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ accounts: [], nextPageToken: "always-more" }),
        ),
      );
      const result = await createGbpClient({ userId: "u1" }).listAccounts();

      expect(result.accounts).toEqual([]);
      // The exact failing input from finding A5's residual: every page came
      // back empty AND the cap was hit with a token still outstanding, so
      // this is a genuine partial -- not proof no accounts exist. Before
      // this fix there was no way for a caller to tell the two apart.
      expect(result.truncated).toBe(true);
      // Whatever the cap is, it must be finite -- a pathological API that
      // never stops returning nextPageToken must not hang this call.
      expect(mocks.fetch.mock.calls.length).toBeGreaterThan(0);
      expect(mocks.fetch.mock.calls.length).toBeLessThan(1000);
    });

    it("is not truncated when the last page fetched simply has no more items to return", async () => {
      mocks.fetch.mockResolvedValue(
        jsonResponse({
          accounts: [{ name: "accounts/1", accountName: "Biz" }],
        }),
      );
      const result = await createGbpClient({ userId: "u1" }).listAccounts();

      expect(result.truncated).toBe(false);
    });
  });
});
