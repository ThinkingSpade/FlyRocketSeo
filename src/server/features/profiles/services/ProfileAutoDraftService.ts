import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { autoDraftRetryCutoffIso } from "@/server/features/profiles/autoDraftPolicy";
import { ProfileDraftService } from "./ProfileDraftService";
import type { ServiceAreaKind } from "@/shared/keyword-fit/profileTypes";

/**
 * Drafts a project's profile from its own site, once, without being asked.
 *
 * The manual button next to it (`draftProjectProfile`) returns a draft for
 * the editor and writes nothing. This one is the opposite: it exists to run
 * unattended on first open, so it MUST write, because the row is the only
 * thing that can record "this already happened".
 *
 * Cost: one OpenRouter call and one capped five-page crawl per attempt -- once
 * per project when it works, at most once a day while it keeps failing. No
 * metered SEO provider is reachable from this file.
 */

type AutoDraftResult =
  | {
      status: "drafted";
      profile: {
        offer: string;
        customer: string;
        exclusions: string;
        brandTerms: string;
        serviceAreaKind: ServiceAreaKind;
      };
    }
  | { status: "skipped" };

async function run(input: {
  projectId: string;
  domain: string | null;
}): Promise<AutoDraftResult> {
  // No domain means no site to read. Deliberately claims nothing: a project
  // that gets a domain later must still be draftable, so there is no attempt
  // worth remembering.
  if (!input.domain) return { status: "skipped" };

  // The claim comes FIRST, before the crawl and before the model call. That
  // ordering is the whole design: whoever loses the insert has nothing left
  // to do, so the card being mounted on several tabs costs one insert attempt
  // each rather than one crawl each.
  //
  // A row an earlier attempt claimed and left empty may be claimed again once
  // per AUTO_DRAFT_RETRY_MS. Without that, the first failure was permanent --
  // which is how every production draft so far ended up empty for good.
  const claimed =
    (await ProjectProfileRepository.claimForDraft(input.projectId)) ||
    (await ProjectProfileRepository.reclaimFailedDraft(
      input.projectId,
      autoDraftRetryCutoffIso(Date.now()),
    ));
  if (!claimed) return { status: "skipped" };

  // A throw here propagates, and the claimed row stays behind on purpose --
  // it is the record that we already tried, and its `draftedAt` is what holds
  // the next attempt off for a day. Deleting it on failure would turn a site
  // we cannot read into a crawl on every page load.
  const profile = await ProfileDraftService.draftFromSite({
    domain: input.domain,
    topQueries: [],
  });

  await ProjectProfileRepository.applyDraft(input.projectId, profile);
  return { status: "drafted", profile };
}

export const ProfileAutoDraftService = { run } as const;
