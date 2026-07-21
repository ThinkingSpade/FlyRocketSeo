import { z } from "zod";

export const localGridCellRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const geocodeRequestSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().trim().min(2).max(200),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/local-grid              */
/* ------------------------------------------------------------------ */

export const localGridSearchSchema = z.object({
  q: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Grid radius in miles (center to edge). */
  r: z.number().min(0.5).max(25).optional(),
  /** Grid size per side (3 | 5 | 7). */
  g: z.number().int().min(3).max(7).optional(),
});
