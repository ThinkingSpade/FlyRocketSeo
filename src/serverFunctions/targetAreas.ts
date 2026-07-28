import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { TargetAreaService } from "@/server/features/geo/services/TargetAreaService";

const targetAreaSchema = z.object({
  kind: z.enum(["metro", "city", "region", "country"]),
  locationCode: z.number().int().positive(),
  label: z.string().min(1),
  parentCountryCode: z.number().int().positive(),
});

/**
 * The confirmed primary area, the pending (unconfirmed) proposal, or null.
 * No validator, matching `getGeoLocationSeedStatus`'s convention in
 * geo.ts — there is no input beyond project scope, which `requireProjectContext`
 * already resolves.
 *
 * Detection (free signals only — see TargetAreaService's own header, and the
 * no-metered-spend grep it documents) runs fresh on every call when nothing
 * is confirmed yet. This endpoint itself never writes anything: it is a thin
 * pass-through to TargetAreaService.getTargetArea, whose own invariant is
 * that it never calls the one function that can write `confirmedAt`.
 */
export const getTargetArea = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .handler(async ({ context }) => {
    return TargetAreaService.getTargetArea(
      { projectId: context.projectId },
      context,
    );
  });

const confirmTargetAreaSchema = z.object({
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

/** No validator — same reasoning as `getTargetArea` above. */
export const clearTargetArea = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .handler(async ({ context }) => {
    await TargetAreaService.clearTargetArea({ projectId: context.projectId });
  });
