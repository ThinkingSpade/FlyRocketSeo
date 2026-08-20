import { getRouteApi } from "@tanstack/react-router";
import { Sparkle } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import { useAiExplainAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import { useProjectProfile } from "@/client/features/profiles/useProjectProfile";
import type { KeywordResearchControllerState } from "./types";

const keywordsRoute = getRouteApi("/_project/p/$projectId/keywords");

/**
 * Split out of KeywordResearchDesktopResults, which sits on this repo's
 * 400-line ceiling. It is genuinely self-contained — its own availability
 * hooks, its own null-render rule — so it was the natural piece to lift rather
 * than the arbitrary one.
 */
export function FitRefinementButton({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const aiAvailable = useAiExplainAvailable();
  const { profile } = useProjectProfile(keywordsRoute.useParams().projectId);
  const { fitRefinement } = controller;
  if (!aiAvailable || profile.offer.trim() === "") return null;

  const result = fitRefinement.data;
  const hint = result
    ? `${result.classified} newly checked${result.skipped > 0 ? `, ${result.skipped} over the per-run cap` : ""}`
    : "Judge every keyword against this client's profile, not just the exclusion rules";
  const label = fitRefinement.isPending
    ? "Checking fit…"
    : result
      ? "Fit checked"
      : "Check fit with AI";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={fitRefinement.isPending || controller.rows.length === 0}
      onClick={controller.runFitRefinement}
      title={hint}
    >
      <Sparkle className="size-3.5 text-base-content/60" />
      {label}
    </Button>
  );
}
