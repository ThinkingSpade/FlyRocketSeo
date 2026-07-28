import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { ExplainService } from "@/server/features/insights/services/ExplainService";
import { MAX_EXPLAIN_ACTIONS } from "@/server/features/insights/services/explainPrompt";

const explainFindingsSchema = z.object({
  projectId: z.string().min(1),
  tab: z.string().min(1).max(60),
  read: z.string().min(1).max(600),
  actions: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        evidence: z.string().min(1).max(200),
      }),
    )
    .max(MAX_EXPLAIN_ACTIONS),
});

/**
 * Rewrites a deterministic verdict as prose. Explicitly invoked -- never
 * called on a result load -- so a tab costs nothing unless the user asks
 * for this.
 */
export const explainFindings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(explainFindingsSchema)
  .handler(async ({ data }) =>
    ExplainService.explainVerdict({
      tab: data.tab,
      read: data.read,
      actions: data.actions,
    }),
  );
