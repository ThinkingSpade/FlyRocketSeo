import { describe, expect, it, vi } from "vitest";

const { dataforseoGetJsonMock } = vi.hoisted(() => ({
  dataforseoGetJsonMock: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  dataforseoGetJson: dataforseoGetJsonMock,
}));

import { fetchDataforseoBalance } from "./account";

// A trimmed but shape-faithful `/v3/appendix/user_data` envelope.
function userDataEnvelope(money: Record<string, unknown> | null) {
  return {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        path: ["v3", "appendix", "user_data"],
        result: [{ login: "user@example.com", timezone: "UTC", money }],
      },
    ],
  };
}

describe("fetchDataforseoBalance", () => {
  it("reads the balance from tasks[0].result[0].money", async () => {
    dataforseoGetJsonMock.mockResolvedValueOnce(
      userDataEnvelope({ total: 1000, balance: 123.45 }),
    );

    await expect(fetchDataforseoBalance()).resolves.toEqual({
      balance: 123.45,
      currency: "USD",
    });
  });

  it("keeps an explicit currency when DataForSEO returns one", async () => {
    dataforseoGetJsonMock.mockResolvedValueOnce(
      userDataEnvelope({ balance: 10, currency: "EUR" }),
    );

    await expect(fetchDataforseoBalance()).resolves.toEqual({
      balance: 10,
      currency: "EUR",
    });
  });

  it("returns null when the balance is missing or non-numeric", async () => {
    dataforseoGetJsonMock.mockResolvedValueOnce(userDataEnvelope({}));
    await expect(fetchDataforseoBalance()).resolves.toBeNull();

    dataforseoGetJsonMock.mockResolvedValueOnce(
      userDataEnvelope({ balance: "oops" }),
    );
    await expect(fetchDataforseoBalance()).resolves.toBeNull();
  });

  it("returns null on an unexpected response shape rather than throwing", async () => {
    dataforseoGetJsonMock.mockResolvedValueOnce({ tasks: [] });
    await expect(fetchDataforseoBalance()).resolves.toBeNull();

    dataforseoGetJsonMock.mockResolvedValueOnce("not json at all");
    await expect(fetchDataforseoBalance()).resolves.toBeNull();
  });
});
