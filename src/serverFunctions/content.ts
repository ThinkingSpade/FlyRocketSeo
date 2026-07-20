import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  contentBriefRequestSchema,
  contentCompetitorRequestSchema,
} from "@/types/schemas/content";
import { ContentBriefService } from "@/server/features/content/services/ContentBriefService";

/** SDK-level errors (DataForSEO client classes) can carry unserializable
 *  payloads, which seroval masks as an opaque "Seroval Error" 500. Log the
 *  real failure and rethrow a plain Error so the client sees the message. */
function rethrowPlain(scope: string, error: unknown): never {
  console.error(`[${scope}] failed:`, error);
  throw error instanceof Error &&
    error.constructor === Error
    ? error
    : new Error(
        error instanceof Error ? error.message : String(error).slice(0, 300),
      );
}

export const getContentBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(contentBriefRequestSchema)
  .handler(async ({ data, context }) => {
    try {
      return await ContentBriefService.getContentBrief(
        {
          ...data,
          projectId: context.projectId,
        },
        context,
      );
    } catch (error) {
      rethrowPlain("content:brief", error);
    }
  });

export const analyzeContentCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(contentCompetitorRequestSchema)
  .handler(async ({ data, context }) => {
    try {
      return await ContentBriefService.analyzeCompetitorPage(
        {
          projectId: context.projectId,
          url: data.url,
        },
        context,
      );
    } catch (error) {
      rethrowPlain("content:competitor", error);
    }
  });
