import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BrandVisibilityService } from "@/server/features/ai-search/services/brandVisibility";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

/**
 * Same paid gate as the Brand Lookup endpoints: analyzing spends DataForSEO
 * credits, so hosted deployments require the paid plan. Self-hosted deployments
 * pay DataForSEO directly and aren't gated. Mirrors `assertPaidPlan` in
 * serverFunctions/ai-search.ts.
 */
async function assertPaidPlan(organizationId: string) {
  if (!(await isHostedServerAuthMode())) return;
  if (await customerHasPaidPlan(organizationId)) return;
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Upgrade to the paid plan to use AI Visibility",
  );
}

const analyzeSchema = z.object({
  projectId: z.string().min(1),
  competitors: z
    .array(z.string().trim().min(1).max(BRAND_LOOKUP_MAX_INPUT_LENGTH))
    .max(5)
    .default([]),
});

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

/**
 * Run the project's own AI-visibility analysis and record a snapshot. Metered —
 * the one credit-spending path here — and only ever on an explicit user click.
 */
export const analyzeProjectBrand = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyzeSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return BrandVisibilityService.analyze(
      context.projectId,
      context,
      data.competitors,
    );
  });

/**
 * Stored AI-visibility snapshots for the project: trend + latest result. Free —
 * reads rows only, no API call — so it isn't gated behind the paid plan.
 */
export const getBrandVisibilityHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return BrandVisibilityService.history(context.projectId);
  });
