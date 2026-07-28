import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const { createGbpClient } = await import("./gbpClient");
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
    const { createGbpClient } = await import("./gbpClient");
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
    const { createGbpClient } = await import("./gbpClient");
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
    const { createGbpClient, GbpApiError } = await import("./gbpClient");
    await expect(
      createGbpClient({ userId: "u1" }).listAccounts(),
    ).rejects.toBeInstanceOf(GbpApiError);
    await expect(
      createGbpClient({ userId: "u1" }).listAccounts(),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws GbpTokenError when no access token can be minted", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    const { createGbpClient, GbpTokenError } = await import("./gbpClient");
    await expect(
      createGbpClient({ userId: "u1" }).listAccounts(),
    ).rejects.toBeInstanceOf(GbpTokenError);
  });
});
