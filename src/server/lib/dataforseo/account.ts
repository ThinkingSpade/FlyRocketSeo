import { z } from "zod";
import { dataforseoGetJson } from "@/server/lib/dataforseo/core";

// DataForSEO account status — the live prepaid balance shown to self-hosters so
// they can see what's left on their own key. Never expose this in hosted mode:
// the key there is the operator's shared account (see getDataforseoAccountStatus).

type DataforseoBalance = {
  balance: number;
  currency: string;
};

// The SDK doesn't type `/v3/appendix/user_data`, so validate defensively and
// only read the one field we need. `passthrough()` keeps the rest of the
// (large) payload from tripping the parse.
const userDataResponseSchema = z.object({
  tasks: z
    .array(
      z
        .object({
          result: z
            .array(
              z
                .object({
                  money: z
                    .object({
                      balance: z.number().nullable().optional(),
                      currency: z.string().nullable().optional(),
                    })
                    .passthrough()
                    .nullable()
                    .optional(),
                })
                .passthrough(),
            )
            .nullable()
            .optional(),
        })
        .passthrough(),
    )
    .nullable()
    .optional(),
});

/**
 * Live prepaid balance from DataForSEO's `/v3/appendix/user_data`.
 *
 * Returns null (rather than throwing) when the response lacks a numeric
 * balance, so an upstream shape change degrades to "unknown" instead of an
 * error surfaced in the app shell. HTTP/auth failures still throw via the
 * shared authenticated fetch and are handled by the caller.
 */
export async function fetchDataforseoBalance(): Promise<DataforseoBalance | null> {
  const json = await dataforseoGetJson("/v3/appendix/user_data");
  const parsed = userDataResponseSchema.safeParse(json);
  if (!parsed.success) return null;

  const money = parsed.data.tasks?.[0]?.result?.[0]?.money;
  if (!money || typeof money.balance !== "number") return null;

  return {
    balance: money.balance,
    // DataForSEO bills in USD; keep any explicit currency it does return.
    currency: money.currency ?? "USD",
  };
}
