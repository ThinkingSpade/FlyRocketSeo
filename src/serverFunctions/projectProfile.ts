import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { AppError } from "@/server/lib/errors";
import { ProfileDraftService } from "@/server/features/profiles/services/ProfileDraftService";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import {
  EMPTY_PROFILE,
  SERVICE_AREA_KINDS,
  type ProjectProfile,
} from "@/shared/keyword-fit/profileTypes";

/**
 * Read/write for a project's business profile.
 *
 * Both endpoints are free by construction: they touch D1 and nothing else, so
 * opening or saving the profile editor can never reach a metered provider.
 * The AI drafting path (Phase 2) is a SEPARATE server function precisely so
 * that stays true of these two — see the no-auto-spend rule in the design doc.
 *
 * `projectId` is declared in every validator here for the reason
 * targetAreas.ts documents at length: `ensureUserMiddleware` resolves
 * `context.project` off the RAW client payload before any validator narrows
 * it, so a `requireProjectContext` function without a `projectId` field can
 * never receive one.
 */
const projectScopedSchema = z.object({ projectId: z.string().min(1) });

/**
 * This project's profile, or an empty one.
 *
 * Returns `EMPTY_PROFILE` rather than null for a project that has never had
 * one, so every caller renders the same shape and the editor does not need a
 * separate "no row yet" branch. `hasUsableProfile` (keywordFit.ts) is what
 * callers check before acting on it — an empty profile must leave the results
 * table exactly as it was rather than labelling every row.
 */
export const getProjectProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }): Promise<ProjectProfile> => {
    const row = await ProjectProfileRepository.getByProject(context.projectId);
    if (!row) return EMPTY_PROFILE;
    return {
      offer: row.offer,
      customer: row.customer,
      exclusions: row.exclusions,
      brandTerms: row.brandTerms,
      serviceAreaKind: row.serviceAreaKind,
      source: row.source,
      confirmedAt: row.confirmedAt,
    };
  });

// Generous caps rather than tight ones: these are free-text fields a user
// writes in their own words, and the only real requirement is that a runaway
// paste cannot bloat a row. The classifier ignores anything it cannot parse.
const saveProjectProfileSchema = z.object({
  projectId: z.string().min(1),
  offer: z.string().max(2000),
  customer: z.string().max(2000),
  exclusions: z.string().max(2000),
  brandTerms: z.string().max(1000),
  serviceAreaKind: z.enum(SERVICE_AREA_KINDS),
});

/**
 * Saves the profile as CONFIRMED — this endpoint is only ever reached by a
 * human pressing Save in the editor, which is exactly what `confirmedAt`
 * records. An AI draft reaches the same table through the Phase 2 path with
 * `confirmedAt: null` and stays a proposal until it passes through here.
 *
 * Cached fit verdicts are dropped on every save: a verdict is a function of
 * the profile that produced it, so an edited exclusion line must invalidate
 * every row it could have decided.
 */
export const saveProjectProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveProjectProfileSchema)
  .handler(async ({ data, context }) => {
    await ProjectProfileRepository.upsert({
      projectId: context.projectId,
      offer: data.offer,
      customer: data.customer,
      exclusions: data.exclusions,
      brandTerms: data.brandTerms,
      serviceAreaKind: data.serviceAreaKind,
      source: "manual",
      confirmedAt: new Date().toISOString(),
    });
    await ProjectProfileRepository.clearVerdicts(context.projectId);
    return { saved: true } as const;
  });

/**
 * Drafts a profile from the client's own website.
 *
 * Returns the draft for the editor to show; it deliberately does NOT write to
 * `project_profiles`. A human corrects it and presses Save, which is what
 * `confirmedAt` records — an AI guess must be fixable once rather than re-made
 * on every run.
 *
 * Search Console queries are not fed in yet. `getSearchPerformanceReport`'s
 * response shape is being reworked in parallel, and reading it from here would
 * couple this endpoint to that change for a marginal prompt improvement; the
 * site's own text is the load-bearing input.
 */
export const draftProjectProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const domain = context.project.domain;
    if (!domain) {
      throw new AppError(
        "INTERNAL_ERROR",
        "This project has no domain set, so there's no site to read. Add one in project settings, or fill the fields in yourself.",
      );
    }
    return ProfileDraftService.draftFromSite({ domain, topQueries: [] });
  });

const generateSeedsSchema = z.object({
  projectId: z.string().min(1),
  offer: z.string().max(2000),
  customer: z.string().max(2000),
  exclusions: z.string().max(2000),
  serviceAreaKind: z.enum(SERVICE_AREA_KINDS),
  /** The tab's active target area label, or null when national/global. */
  areaLabel: z.string().max(200).nullable(),
});

/**
 * Seed keyword candidates the client's own customer would type.
 *
 * These carry no volume, difficulty or CPC — they are strings to feed into the
 * (metered) expansion on an explicit click, which is what keeps this endpoint
 * free and keeps spending a decision the user makes.
 */
export const generateSeedKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(generateSeedsSchema)
  .handler(async ({ data }) => {
    const seeds = await ProfileDraftService.generateSeeds({
      offer: data.offer,
      customer: data.customer,
      exclusions: data.exclusions,
      serviceAreaKind: data.serviceAreaKind,
      areaLabel: data.areaLabel,
    });
    return { seeds };
  });
