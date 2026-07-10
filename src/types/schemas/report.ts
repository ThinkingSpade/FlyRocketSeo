import { z } from "zod";

/** `?range=` on the report page; anything unrecognized falls back to 30d. */
export const reportSearchSchema = z.object({
  range: z.enum(["30d", "90d"]).optional().catch(undefined),
});
