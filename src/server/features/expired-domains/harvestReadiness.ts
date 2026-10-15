import {
  isAutoDraftDue,
  isEmptyAutoDraft,
} from "@/server/features/profiles/autoDraftPolicy";
import { deriveSeedTerms } from "@/shared/domainNameCandidates";

/**
 * Whether a project has the vocabulary a harvest matches against, and if not,
 * what happens next.
 *
 * The harvest matches a day's dropped domains against SEED terms, which come
 * only from tracked keywords and the profile's offer. A project with neither
 * used to stay a harvest candidate forever: every attempt failed on an empty
 * vocabulary, the date never completed, and because the scheduler harvests
 * before it grades, one such project starved Domain Rating grading for every
 * other project. Readiness is what keeps those apart.
 *
 * Pure, so the cron's selection and the panel's status line cannot disagree.
 */
export type HarvestReadiness =
  /** Seed terms exist; the harvest can run. */
  | { kind: "ready"; seedTermCount: number }
  /** No profile yet, or a failed draft is due a retry: the cron drafts one. */
  | { kind: "draft-due" }
  /** A draft is running, or failed recently and waits out its retry window. */
  | { kind: "draft-waiting"; draftedAt: string | null }
  /** A profile someone saved (or a draft that produced text) has no usable
   *  words, and there are no tracked keywords. Only a person can fix this. */
  | { kind: "needs-input" };

type ProfileSnapshot = {
  offer: string;
  customer: string;
  exclusions: string;
  brandTerms: string;
  source: "ai" | "manual";
  confirmedAt: string | null;
  draftedAt: string | null;
};

export function harvestReadiness(input: {
  keywords: string[];
  profile: ProfileSnapshot | null;
  nowMs: number;
}): HarvestReadiness {
  const seed = deriveSeedTerms(input.keywords, input.profile?.offer ?? "");
  if (seed.length > 0) return { kind: "ready", seedTermCount: seed.length };

  if (isAutoDraftDue(input.profile, input.nowMs)) return { kind: "draft-due" };
  if (input.profile && isEmptyAutoDraft(input.profile)) {
    return { kind: "draft-waiting", draftedAt: input.profile.draftedAt };
  }
  return { kind: "needs-input" };
}
