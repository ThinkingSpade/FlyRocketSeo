import { z } from "zod";

export const linkInsightsRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const linkPresenceRequestSchema = z.object({
  projectId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048),
  targetUrl: z.string().url().max(2048),
  phrase: z.string().trim().min(1).max(200),
});
