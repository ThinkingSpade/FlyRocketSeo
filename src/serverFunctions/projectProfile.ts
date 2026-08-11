import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { AppError } from "@/server/lib/errors";
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
 * The two AI services are loaded at the point of use, not imported at the top.
 *
 * TanStack Start splits this file into one server-function provider chunk, so a
 * static import made `getProjectProfile`/`saveProjectProfile` evaluate
 * `ProfileDraftService` -> `siteTextCrawl` -> cheerio/parse5 (277 KB) before
 * they could read a D1 row. That undoes this file's whole premise — see the
 * header: these two are meant to touch D1 and nothing else.
 *
 * It matters more than a normal lazy-load because the Worker's isolate does not
 * survive a server-function request (measured 2026-07-31), so the evaluation is
 * paid on every call rather than once. `import()` results are module-cached, so
 * the drafting endpoints pay it at most once per isolate, exactly as before.
 */
const loadProfileDraftService = () =>
  import("@/server/features/profiles/services/ProfileDraftService").then(
    (m) => m.ProfileDraftService,
  );

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
    const ProfileDraftService = await loadProfileDraftService();
    return ProfileDraftService.draftFromSite({ domain, topQueries: [] });
  });

/**
 * Drafts the profile on first open, without being asked, exactly once.
 *
 * Unlike `draftProjectProfile` above, this one WRITES — an unconfirmed
 * `source: "ai"` row, claimed before any crawl starts. That write is the only
 * durable record that drafting already happened for this project, and it is
 * what keeps an unattended trigger from re-crawling on every page load. The
 * row stays a proposal until a human presses Save, exactly as before.
 *
 * Safe to call from every mount of the profile card: a project that already
 * has a row loses the claim and returns `skipped` after a single insert
 * attempt, without reaching the crawl or the model.
 */
const loadProfileAutoDraftService = () =>
  import("@/server/features/profiles/services/ProfileAutoDraftService").then(
    (m) => m.ProfileAutoDraftService,
  );

export const autoDraftProjectProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const ProfileAutoDraftService = await loadProfileAutoDraftService();
    return ProfileAutoDraftService.run({
      projectId: context.projectId,
      domain: context.project.domain ?? null,
    });
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
    const ProfileDraftService = await loadProfileDraftService();
    const seeds = await ProfileDraftService.generateSeeds({
      offer: data.offer,
      customer: data.customer,
      exclusions: data.exclusions,
      serviceAreaKind: data.serviceAreaKind,
      areaLabel: data.areaLabel,
    });
    return { seeds };
  });

const refineKeywordFitSchema = z.object({
  projectId: z.string().min(1),
  keywords: z.array(z.string().min(1)).max(500),
});

/**
 * Sharpens the free rules verdicts with one model pass, cached per keyword.
 *
 * The rules classifier only fires on exclusion lines the user wrote, which is
 * its strength and its ceiling: a profile that says only "we don't sell
 * machines" leaves "how to start a vending machine business" and "spg vending
 * jobs" unflagged, because nothing rules out DIY or recruitment. This reads
 * the profile as prose and judges the same way a person would.
 *
 * Costs one model call per 40 uncached keywords and nothing at all on a
 * second look, so it stays behind an explicit click. Never metered SEO spend.
 */
export const refineKeywordFit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(refineKeywordFitSchema)
  .handler(async ({ data, context }) => {
    const { KeywordFitService } =
      await import("@/server/features/profiles/services/KeywordFitService");
    return KeywordFitService.refine({
      projectId: context.projectId,
      keywords: data.keywords,
    });
  });
