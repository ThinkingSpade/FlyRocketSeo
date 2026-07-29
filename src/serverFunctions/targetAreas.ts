import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { TargetAreaService } from "@/server/features/geo/services/TargetAreaService";

/**
 * Every `requireProjectContext` server function in this codebase (gbp.ts,
 * onPage.ts, local-seo.ts, projects.ts, ...) declares `projectId` in its own
 * validator, because `ensureUserMiddleware` (wired globally in start.ts, so
 * it runs before this file's own `.validator()` narrows anything) resolves
 * `context.project` by reading `data.projectId` off the RAW client payload —
 * it does not read `context` at all, since nothing has populated it yet at
 * that point in the chain. A `requireProjectContext` function with no
 * `projectId` field anywhere in its validator can never receive one, so
 * `context.project` stays undefined and `requireProjectContext` unconditionally
 * throws "Project context missing". Matches `projectScopedSchema` in
 * onPage.ts/gbp.ts/projects.ts et al. verbatim.
 */
const projectScopedSchema = z.object({ projectId: z.string().min(1) });

const targetAreaSchema = z.object({
  kind: z.enum(["metro", "city", "region", "country"]),
  locationCode: z.number().int().positive(),
  label: z.string().min(1),
  parentCountryCode: z.number().int().positive(),
});

/**
 * The confirmed primary area, the pending (unconfirmed) proposal, or null.
 *
 * Detection (free signals only — see TargetAreaService's own header, and the
 * no-metered-spend grep it documents) runs fresh on every call when nothing
 * is confirmed yet. This endpoint itself never writes anything: it is a thin
 * pass-through to TargetAreaService.getTargetArea, whose own invariant is
 * that it never calls the one function that can write `confirmedAt`.
 */
export const getTargetArea = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return TargetAreaService.getTargetArea(
      { projectId: context.projectId },
      context,
    );
  });

const confirmTargetAreaSchema = z.object({
  projectId: z.string().min(1),
  area: targetAreaSchema,
  source: z.enum(["gbp", "gsc"]),
});

/**
 * Accepts a proposal the detection cascade surfaced — the user clicked
 * "Use this for research" (or picked one area from a multi-location
 * proposal). This and `setTargetArea` below are the only two server
 * functions that can ever confirm an area; see TargetAreaService's own
 * header for why a proposal must never auto-confirm any other way.
 */
export const confirmTargetArea = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(confirmTargetAreaSchema)
  .handler(async ({ data, context }) => {
    return TargetAreaService.confirmTargetArea({
      projectId: context.projectId,
      area: data.area,
      source: data.source,
    });
  });

const setTargetAreaSchema = z.object({
  projectId: z.string().min(1),
  area: targetAreaSchema,
});

/**
 * Manual override from the picker (the confirmation banner's "Not right?",
 * or a fresh selection) — confirmed immediately, per the spec.
 * `TargetAreaService.setTargetArea` itself hardcodes `source: "manual"`
 * regardless of how the area was found, so this endpoint never accepts a
 * client-supplied source the way `confirmTargetArea` does.
 */
export const setTargetArea = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setTargetAreaSchema)
  .handler(async ({ data, context }) => {
    return TargetAreaService.setTargetArea({
      projectId: context.projectId,
      area: data.area,
    });
  });

export const clearTargetArea = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await TargetAreaService.clearTargetArea({ projectId: context.projectId });
  });
