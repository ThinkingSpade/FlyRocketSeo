import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import { Modal } from "@/client/components/Modal";
import type { DiscoveryMode } from "@/types/schemas/competitors";
import {
  useProjectCompetitorsQuery,
  useRemoveProjectCompetitorMutation,
} from "./useCompetitorsQueries";

/** How this competitors list was built -- an auditable claim, not just a
 *  ranked list dropped on the page with no explanation of its source. */
function discoveryModeCopy(discoveryMode: DiscoveryMode, seedSize: number) {
  return discoveryMode === "serp"
    ? `Based on the top ${seedSize} Search Console queries you don't already rank #1 for.`
    : "Based on domains sharing keywords with you — connect Search Console for a sharper answer.";
}

/**
 * Says how this competitor list was built, and surfaces any standing
 * exclusions so hiding a domain is never invisible. Pulled out of
 * `CompetitorsPage` to keep that file under this repo's line-count cap --
 * the same reason `CompetitorsRestoreNotice` and `CompetitorsOverviewExtras`
 * were split out.
 */
export function CompetitorsDiscoveryNotice({
  projectId,
  discoveryMode,
  seedSize,
  hiddenCount,
  seedTruncated,
}: {
  projectId: string;
  discoveryMode: DiscoveryMode;
  seedSize: number;
  hiddenCount: number;
  /** True when the GSC pull the seed was drawn from came back full, so
   *  Google's clicks-descending ordering may have cut lower-ranked (lower
   *  click, but real-impression) queries out of the seed before this run
   *  ever saw them. See `seedTruncated` on `competitorsPageSchema`. */
  seedTruncated: boolean;
}) {
  const [managing, setManaging] = useState(false);

  return (
    <div className="flex flex-col gap-1 text-xs text-base-content/60">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p>{discoveryModeCopy(discoveryMode, seedSize)}</p>
        {hiddenCount > 0 ? (
          <div className="flex items-center gap-2">
            <span>
              {hiddenCount} domain{hiddenCount === 1 ? "" : "s"} hidden
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setManaging(true)}
            >
              Manage
            </Button>
          </div>
        ) : null}
      </div>
      {seedTruncated ? (
        <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          Search Console had more queries than we could pull in one run —
          this list may be missing ones you rank lower for.
        </p>
      ) : null}
      {managing ? (
        <HiddenDomainsModal
          projectId={projectId}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Lists the domains this project currently excludes, each with an Unhide
 * action. `listProjectCompetitors` is a free D1 read, so this fetches on
 * demand with a plain query -- no metering, no `authorized` gate needed.
 */
function HiddenDomainsModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data, isPending } = useProjectCompetitorsQuery(projectId);
  const removeMutation = useRemoveProjectCompetitorMutation(projectId);
  const excluded = (data ?? []).filter((row) => row.status === "excluded");

  return (
    <Modal
      onClose={onClose}
      labelledBy="hidden-domains-title"
      maxWidth="max-w-md"
    >
      <h3 id="hidden-domains-title" className="text-lg font-semibold">
        Hidden domains
      </h3>
      <p className="text-sm text-base-content/70">
        These domains are excluded from every competitors run for this project.
      </p>
      {isPending ? (
        <Loader2
          className="size-4 animate-spin text-base-content/50"
          aria-hidden="true"
        />
      ) : excluded.length === 0 ? (
        <p className="text-sm text-base-content/60">Nothing is hidden.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {excluded.map((row) => (
            <li
              key={row.domain}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{row.domain}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={
                  removeMutation.isPending &&
                  removeMutation.variables?.domain === row.domain
                }
                onClick={() =>
                  removeMutation.mutate({
                    domain: row.domain,
                    reason: "unhide",
                  })
                }
              >
                Unhide
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
