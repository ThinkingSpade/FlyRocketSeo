import { z } from "zod";

export const pageExplorerRequestSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().url().max(2048),
  locationCode: z.number().int().positive().optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/page                    */
/* ------------------------------------------------------------------ */

export const pageExplorerSearchSchema = z.object({
  u: z.string().optional(),
  loc: z.number().int().positive().optional(),
});
