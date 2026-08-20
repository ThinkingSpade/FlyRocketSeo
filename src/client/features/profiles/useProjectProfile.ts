import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  autoDraftProjectProfile,
  draftProjectProfile,
  generateSeedKeywords,
  getProjectProfile,
  refineKeywordFit,
  saveProjectProfile,
} from "@/serverFunctions/projectProfile";
import {
  classifyKeyword,
  hasUsableProfile,
  type FitResult,
} from "@/shared/keyword-fit/keywordFit";
import {
  EMPTY_PROFILE,
  type ProjectProfile,
  type ServiceAreaKind,
} from "@/shared/keyword-fit/profileTypes";

/**
 * The project's business profile, plus the classification it powers.
 *
 * Both are free: the profile is one D1 read, and classification is pure
 * client-side string work (keywordFit.ts) over rows the tab already has. No
 * path from here reaches a metered provider, which is what lets the results
 * table label every row the moment it renders instead of behind a button.
 */

const PROFILE_STALE_MS = 5 * 60_000;

function projectProfileQueryKey(projectId: string) {
  return ["projectProfile", projectId] as const;
}

export function useProjectProfile(projectId: string) {
  const query = useQuery({
    queryKey: projectProfileQueryKey(projectId),
    queryFn: () => getProjectProfile({ data: { projectId } }),
    staleTime: PROFILE_STALE_MS,
  });

  return {
    // A failed or in-flight read degrades to the empty profile rather than an
    // error: a missing profile should cost you labels, not the tab.
    profile: query.data ?? EMPTY_PROFILE,
    isLoading: query.isLoading,
    // Surfaced separately because one caller cannot treat it as "no profile":
    // the client report prints, and "the client has not filled this in" and
    // "we could not read it" are different sentences to hand someone. Every
    // other caller ignores this and keeps the degrade-quietly behaviour.
    isError: query.isError,
  };
}

export function useSaveProjectProfile(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: Omit<ProjectProfile, "source" | "confirmedAt">) =>
      saveProjectProfile({
        data: {
          projectId,
          offer: profile.offer,
          customer: profile.customer,
          exclusions: profile.exclusions,
          brandTerms: profile.brandTerms,
          serviceAreaKind: profile.serviceAreaKind,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectProfileQueryKey(projectId),
      });
    },
  });
}

/**
 * Verdicts for the keywords currently on screen, keyed by keyword.
 *
 * Returns an EMPTY map when the profile cannot produce a verdict
 * (`hasUsableProfile`). That is the difference between "we checked and this
 * is fine" and "we have nothing to check against" — labelling every row
 * "adjacent" because the user has not filled anything in would be noise
 * dressed up as analysis, and would make the filter count lie.
 */
export function useKeywordFit(
  profile: ProjectProfile,
  keywords: readonly string[],
): ReadonlyMap<string, FitResult> {
  // Both inputs are serialized to strings BEFORE the memo, and the memo then
  // reads only those strings -- so its dependency list is honest (no
  // exhaustive-deps suppression) while still not recomputing on every render,
  // which depending on the `profile` object or the `keywords` array directly
  // would cause, since both are new identities each time.
  //
  // Newline-joined, never space-joined: keywords contain spaces, so a space
  // separator could not tell ["a b", "c"] from ["a", "b c"]. Keywords cannot
  // contain newlines, which is what makes the split below lossless.
  const offer = profile.offer;
  const exclusions = profile.exclusions;
  // An AI draft nobody has accepted is a PROPOSAL, per project_profiles' own
  // contract. Classifying against it would let a hallucinated exclusion line
  // silently demote real keywords before anyone agreed the line is true --
  // and the auto-draft on first open means an unreviewed profile is now the
  // ordinary state of a new project, not a rare one. Pressing Save is what
  // turns this on.
  const isConfirmed = profile.confirmedAt !== null;
  const keywordKey = keywords.join("\n");

  return useMemo(() => {
    if (!isConfirmed) return new Map<string, FitResult>();
    const fitProfile = { offer, exclusions };
    if (!hasUsableProfile(fitProfile)) return new Map<string, FitResult>();

    const map = new Map<string, FitResult>();
    for (const keyword of keywordKey ? keywordKey.split("\n") : []) {
      map.set(keyword, classifyKeyword(keyword, fitProfile));
    }
    return map;
  }, [isConfirmed, offer, exclusions, keywordKey]);
}

/**
 * Drafts the profile from the client's own website.
 *
 * Deliberately a mutation rather than a query: it costs a model call and a
 * crawl, so it must only ever run when someone presses the button. The result
 * is handed back to the form as an editable draft, never saved directly.
 */
export function useDraftProjectProfile(projectId: string) {
  return useMutation({
    mutationFn: () => draftProjectProfile({ data: { projectId } }),
  });
}

/**
 * Drafts the profile on first open, unattended.
 *
 * A mutation rather than a query for the same reason as the manual draft
 * above — it costs a model call and a crawl — but this one is triggered by
 * mounting rather than by a click, so the exactly-once guarantee has to come
 * from the server. `autoDraftProjectProfile` claims the row before doing any
 * work; a caller that loses the claim gets `skipped` back and pays nothing.
 *
 * The profile query is invalidated on EITHER outcome, which matters most for
 * the one that looks like it needs nothing. "Skipped" means a row already
 * exists — and the commonest way to reach it is navigating away mid-draft:
 * drafting takes ~16s, React Query drops a mutation's callbacks when its
 * component unmounts, but the request is already in flight and the server
 * still writes the row. The next mount then reads `getProjectProfile` from a
 * cache entry that is fresh for five minutes and says the profile is empty,
 * so a drafted profile stays invisible until that expires or the page is
 * reloaded. One free D1 read on a skipped call closes that.
 */
export function useAutoDraftProjectProfile(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => autoDraftProjectProfile({ data: { projectId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectProfileQueryKey(projectId),
      });
    },
  });
}

/**
 * Seed keyword candidates from the profile. Same reasoning as above: one
 * model call, on a click. The seeds carry no volume until the user runs them
 * through the metered expansion themselves.
 */
export function useGenerateSeedKeywords(projectId: string) {
  return useMutation({
    mutationFn: (input: {
      offer: string;
      customer: string;
      exclusions: string;
      serviceAreaKind: ServiceAreaKind;
      areaLabel: string | null;
    }) => generateSeedKeywords({ data: { projectId, ...input } }),
  });
}

/**
 * The AI fit pass over the keywords currently on screen.
 *
 * Returns verdicts keyed by keyword, which the caller overlays on the free
 * rules verdicts. Deliberately a mutation: it costs a model call for anything
 * not already cached, so it only ever runs from a click.
 */
export function useRefineKeywordFit(projectId: string) {
  return useMutation({
    mutationFn: (keywords: string[]) =>
      refineKeywordFit({ data: { projectId, keywords } }),
  });
}

/**
 * Merges AI verdicts over the rules verdicts.
 *
 * AI wins where it has an opinion; every other keyword keeps the rules
 * verdict, so the table never loses labels because the pass covered part of
 * the set (it is capped, and it can drop a malformed chunk).
 */
export function mergeFitVerdicts(
  rules: ReadonlyMap<string, FitResult>,
  ai: ReadonlyArray<{
    keyword: string;
    verdict: FitResult["verdict"];
    reason: string;
  }>,
): ReadonlyMap<string, FitResult> {
  if (ai.length === 0) return rules;
  const merged = new Map(rules);
  for (const entry of ai) {
    merged.set(entry.keyword, {
      verdict: entry.verdict,
      reason: entry.reason,
    });
  }
  return merged;
}
