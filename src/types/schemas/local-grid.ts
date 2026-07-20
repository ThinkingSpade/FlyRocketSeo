import { z } from "zod";

export const localGridCellRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/local-grid              */
/* ------------------------------------------------------------------ */

export const localGridSearchSchema = z.object({
  q: z.string().optional(),
});
