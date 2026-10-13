import { describe, expect, it } from "vitest";
import { providerFixtureResponse } from "../../e2e/acceptance/provider-transport";
import { z } from "zod";

const fixtureEnvelope = z.object({
  tasks: z.array(
    z.object({
      cost: z.number(),
      data: z.record(z.string(), z.unknown()),
      result: z.array(z.object({ items: z.array(z.unknown()) })),
    }),
  ),
});

const endpoint = new URL(
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
);
const request = {
  method: "POST",
  headers: { Authorization: "Basic acceptance-fake-dataforseo-key" },
  body: JSON.stringify([
    { keyword: "operation rocket", location_code: 2840, language_code: "en" },
  ]),
};

describe("isolated acceptance HTTP fixture boundary", () => {
  it("requires the explicit fake credential rather than matching any provider authorization", async () => {
    expect(
      await providerFixtureResponse(endpoint, {
        ...request,
        headers: { Authorization: "Basic not-the-fixture-credential" },
      }),
    ).toBeNull();
    expect(
      await providerFixtureResponse(endpoint, { ...request, headers: {} }),
    ).toBeNull();
  });
  it("does not match undeclared provider paths, hosts or methods", async () => {
    expect(
      await providerFixtureResponse(
        new URL("https://api.dataforseo.com/v3/undeclared/live"),
        request,
      ),
    ).toBeNull();
    expect(
      await providerFixtureResponse(
        new URL(
          "https://production.example/v3/serp/google/organic/live/advanced",
        ),
        request,
      ),
    ).toBeNull();
    expect(
      await providerFixtureResponse(endpoint, { ...request, method: "GET" }),
    ).toBeNull();
  });
  it("refuses multi-task requests instead of silently certifying an unmodeled batch", async () => {
    expect(
      await providerFixtureResponse(endpoint, {
        ...request,
        body: JSON.stringify([{ keyword: "one" }, { keyword: "two" }]),
      }),
    ).toBeNull();
  });
  it("returns a scoped zero-cost raw SDK envelope for a declared fixture", async () => {
    const response = await providerFixtureResponse(endpoint, request);
    expect(response?.ok).toBe(true);
    const payload = fixtureEnvelope.parse(await response!.json());
    expect(payload.tasks[0].cost).toBe(0);
    expect(payload.tasks[0].data).toEqual(
      z
        .array(z.record(z.string(), z.unknown()))
        .parse(JSON.parse(request.body))[0],
    );
    expect(payload.tasks[0].result[0].items[0]).toMatchObject({
      title: "Acceptance rocket guide",
      etv: 0,
    });
  });
  it("models a successful empty observation separately from a failed paid POST", async () => {
    const empty = await providerFixtureResponse(endpoint, {
      ...request,
      body: JSON.stringify([{ keyword: "operation empty" }]),
    });
    expect(empty?.ok).toBe(true);
    expect(
      fixtureEnvelope.parse(await empty!.json()).tasks[0].result[0].items,
    ).toEqual([]);
    const failed = await providerFixtureResponse(endpoint, {
      ...request,
      body: JSON.stringify([{ keyword: "operation failure" }]),
    });
    expect(failed?.status).toBe(503);
  });
  it("geocodes only the single named fixture city", async () => {
    expect(
      await providerFixtureResponse(
        new URL("https://nominatim.openstreetmap.org/search?q=RealCity"),
      ),
    ).toBeNull();
    const fixture = await providerFixtureResponse(
      new URL("https://nominatim.openstreetmap.org/search?q=Acceptance%20City"),
    );
    expect(fixture?.ok).toBe(true);
  });
});
