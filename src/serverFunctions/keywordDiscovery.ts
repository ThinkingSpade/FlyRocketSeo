import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  runKeywordDiscovery,
  type KeywordDiscoveryInput,
} from "@/server/features/keywords/services/keywordDiscovery";
import { storedMetricGeoSchema } from "@/types/schemas/geo";
import type { KeywordDiscoveryResult } from "@/types/schemas/keyword-discovery";

const inputSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(8),
  geo: storedMetricGeoSchema,
});

/**
 * PAID. One Labs ranked_keywords call per invocation.
 *
 * The Keyword Trends tab calls this automatically the first time a project
 * opens the tab and never again -- the guard is the analysis_runs row this
 * writes, not anything in the client. See shouldAutoRunDiscovery.ts.
 *
 * The explicit return type is not decoration: without it `createServerFn`
 * widens the result union's two branches into one optional-everything object
 * and `status` stops narrowing at every call site (the same trap
 * getQueryMomentum documents).
 */
export const getKeywordDiscovery = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ data, context }): Promise<KeywordDiscoveryResult> => {
    const input: KeywordDiscoveryInput = {
      projectId: context.projectId,
      domain: data.domain,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
      geo: data.geo,
    };
    return runKeywordDiscovery(input, context);
  });
