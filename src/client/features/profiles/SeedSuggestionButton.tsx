import { useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useAiExplainAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import { MAX_KEYWORDS_PER_SUBMIT } from "@/client/features/keywords/keywordResearchTypes";
import type { TargetArea } from "@/shared/geo/types";
import {
  useGenerateSeedKeywords,
  useProjectProfile,
} from "./useProjectProfile";
import { Button } from "@cloudflare/kumo/components/button";

/**
 * Proposes seed keywords the client's own customer would type.
 *
 * This is the half of "smart" that expansion structurally cannot do. Related/
 * suggestions/ideas are string-similarity endpoints: seeded with "dfw
 * vending" they can only return phrases containing those tokens, so "office
 * coffee service dallas" is unreachable no matter how central it is to the
 * business. Generating from the profile is the only path to a candidate that
 * shares no words with anything the user has typed yet.
 *
 * What it produces are CANDIDATES, not keywords -- no volume, no difficulty,
 * no CPC. They land in the search box and the user decides whether to spend on
 * expanding them, which is what keeps this free and keeps the spend a choice.
 */

type Props = {
  projectId: string;
  /** The tab's live scope, so a local client's seeds carry the right city. */
  area: TargetArea;
  disabled: boolean;
  onSuggest: (keywords: string[]) => void;
};

export function SeedSuggestionButton({
  projectId,
  area,
  disabled,
  onSuggest,
}: Props) {
  const aiAvailable = useAiExplainAvailable();
  const { profile } = useProjectProfile(projectId);
  const generate = useGenerateSeedKeywords(projectId);
  const [count, setCount] = useState<number | null>(null);

  // Nothing to generate from, and no key to generate with: in either case the
  // button would be present-and-broken, so it is simply absent. The profile
  // card above is what turns it on.
  if (!aiAvailable || profile.offer.trim() === "") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled || generate.isPending}
        onClick={() => {
          generate.mutate(
            {
              offer: profile.offer,
              customer: profile.customer,
              exclusions: profile.exclusions,
              serviceAreaKind: profile.serviceAreaKind,
              // Only a sub-country area is a place worth appending. A
              // country-kind area would turn "vending service" into "vending
              // service united states", which nobody searches.
              areaLabel: area.kind === "country" ? null : area.label,
            },
            {
              onSuccess: ({ seeds }) => {
                const capped = seeds.slice(0, MAX_KEYWORDS_PER_SUBMIT);
                setCount(capped.length);
                onSuggest(capped);
              },
            },
          );
        }}
      >
        <Sparkle className="size-3.5 text-base-content/60" />
        {generate.isPending ? "Thinking…" : "Suggest keywords for this client"}
      </Button>
      <span className="text-sm text-base-content/60">
        {generate.isError
          ? getStandardErrorMessage(
              generate.error,
              "Couldn't suggest keywords.",
            )
          : count !== null
            ? `${count} added — nothing spent until you search`
            : "Free. Fills the box; you choose whether to search."}
      </span>
    </div>
  );
}
