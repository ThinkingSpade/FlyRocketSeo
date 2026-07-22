import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { OnPageService } from "@/server/features/onpage/services/OnPageService";
import { OnPageAiService } from "@/server/features/onpage/services/OnPageAiService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

const setStatusSchema = z.object({
  projectId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500),
  status: z.enum(["pending", "approved", "excluded"]),
});

const rewriteSchema = z.object({
  projectId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(25),
});

/** Brand name for title suffixes: the project's own name, when it has one. */
async function resolveBrand(projectId: string): Promise<string | null> {
  const project = await ProjectRepository.getProjectById(projectId);
  const name = project?.name?.trim() ?? "";
  return name === "" || name.toLowerCase() === "default" ? null : name;
}

/**
 * Every on-page fix suggested for this project, with the user's approve/exclude
 * decisions. Reads stored rows only — no crawl, no API call.
 */
export const getOnPageFixes = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const rows = await OnPageService.list(context.projectId);
    return { rows };
  });

/**
 * Regenerate suggestions from the latest completed crawl. Free: it reuses
 * stored crawl data plus first-party Search Console rows.
 */
export const generateOnPageFixes = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const brand = await resolveBrand(context.projectId);
    return OnPageService.generate(context.projectId, brand);
  });

/** Approve or exclude suggestions in bulk. */
export const setOnPageFixStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setStatusSchema)
  .handler(async ({ data, context }) => {
    await OnPageService.setStatus(context.projectId, data.ids, data.status);
    return { updated: data.ids.length };
  });

/**
 * Rewrite the selected title/meta suggestions with the LLM. Metered — the only
 * credit-spending path in this feature — and it only runs on an explicit click.
 * Requires OPENROUTER_API_KEY; without it the handler throws PAYMENT_REQUIRED.
 */
export const rewriteOnPageFixes = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(rewriteSchema)
  .handler(async ({ data, context }) => {
    return OnPageAiService.rewrite(context.projectId, data.ids);
  });
