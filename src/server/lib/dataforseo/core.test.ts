import { describe, expect, it } from "vitest";
import {
  DATAFORSEO_MAX_RETRIES,
  shouldRetryDataforseoRequest,
} from "@/server/lib/dataforseo/core";

/**
 * These are money tests, not correctness tests.
 *
 * Every DataForSEO `live` and `task_post` endpoint is a POST and is billed per
 * request. A 5xx does not tell us whether the provider already did the work and
 * charged for it, so replaying a POST can pay twice for one user action. Task
 * reads are GETs and cost nothing to repeat.
 */
describe("shouldRetryDataforseoRequest", () => {
  it("never retries a POST, however transient the failure looks", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(
        shouldRetryDataforseoRequest({ status, method: "POST", attempt: 0 }),
      ).toBe(false);
    }
  });

  it("retries a GET on 5xx until the attempt budget runs out", () => {
    expect(
      shouldRetryDataforseoRequest({ status: 503, method: "GET", attempt: 0 }),
    ).toBe(true);
    expect(
      shouldRetryDataforseoRequest({
        status: 503,
        method: "GET",
        attempt: DATAFORSEO_MAX_RETRIES - 1,
      }),
    ).toBe(true);
    expect(
      shouldRetryDataforseoRequest({
        status: 503,
        method: "GET",
        attempt: DATAFORSEO_MAX_RETRIES,
      }),
    ).toBe(false);
  });

  it("does not retry a GET on 4xx", () => {
    // A bad request or an auth failure will fail identically next time; retrying
    // only delays the error the caller needs to see.
    for (const status of [400, 401, 402, 404, 429]) {
      expect(
        shouldRetryDataforseoRequest({ status, method: "GET", attempt: 0 }),
      ).toBe(false);
    }
  });

  it("treats a missing method as a POST", () => {
    // fetch() defaults to GET when `method` is absent, but the DataForSEO SDK
    // always sets it for billable calls. Defaulting to "do not retry" means a
    // future caller that forgets cannot accidentally buy a second call.
    expect(shouldRetryDataforseoRequest({ status: 503, attempt: 0 })).toBe(
      false,
    );
  });

  it("is case-insensitive about the method", () => {
    expect(
      shouldRetryDataforseoRequest({ status: 503, method: "get", attempt: 0 }),
    ).toBe(true);
    expect(
      shouldRetryDataforseoRequest({ status: 503, method: "post", attempt: 0 }),
    ).toBe(false);
  });
});
