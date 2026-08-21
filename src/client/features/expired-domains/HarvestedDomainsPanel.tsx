import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  checkHarvestedAvailability,
  getHarvestedDomains,
  runHarvestNow,
} from "@/serverFunctions/domainHarvest";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

/** Availability bills 5 APIVerve credits per domain. */
const CREDITS_PER_CHECK = 5;
const MAX_AVAILABILITY_BATCH = 25;

function ratingLabel(rating: number | null): string {
  // null is NOT YET GRADED, not "no authority" -- a real 0 shows as 0.
  return rating === null ? "—" : String(rating);
}

function availabilityLabel(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Available" : "Taken";
}

/**
 * The shortlist harvested from the daily deleted-domain feed.
 *
 * Reading it is free and it loads on mount, unlike everything else on this
 * tab: the rows are already stored, and the feed is a flat subscription rather
 * than a metered API, so there is nothing to gate. Availability is the one
 * billed action here and it stays behind an explicit click with its cost shown.
 */
export function HarvestedDomainsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [minRating, setMinRating] = useState(0);

  const harvestQuery = useQuery({
    queryKey: ["harvested-domains", projectId],
    queryFn: () => getHarvestedDomains({ data: { projectId } }),
  });

  const harvestNow = useMutation({
    mutationFn: () => runHarvestNow({ data: { projectId } }),
    onSuccess: async (result) => {
      if (result.terms.length === 0) {
        toast.error(
          "No industry vocabulary yet — add rank-tracked keywords or a business profile first.",
        );
        return;
      }
      if (result.failedDates.length > 0) {
        toast.error(`Could not pull ${result.failedDates.join(", ")}.`);
      }
      if (result.harvestedDates.length === 0) {
        toast.success("Already up to date — every recent day is harvested.");
      } else {
        toast.success(
          `Harvested ${result.harvestedDates.join(", ")} — ${result.matched} matches.`,
        );
      }
      await queryClient.invalidateQueries({
        queryKey: ["harvested-domains", projectId],
      });
    },
    onError: (error: unknown) => {
      toast.error(getStandardErrorMessage(error, "The harvest failed."));
    },
  });

  // Read straight off query data: a `?? []` default allocates a new array on
  // every render, which would make the memo below recompute every time.
  const rows = harvestQuery.data?.rows;
  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (row) => minRating === 0 || (row.domainRating ?? -1) >= minRating,
      ),
    [rows, minRating],
  );

  const uncheckedTop = useMemo(
    () =>
      visible
        .filter((row) => row.isAvailable === null)
        .slice(0, MAX_AVAILABILITY_BATCH)
        .map((row) => row.domain),
    [visible],
  );

  const checkAvailability = useMutation({
    mutationFn: () =>
      checkHarvestedAvailability({
        data: { projectId, domains: uncheckedTop },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["harvested-domains", projectId],
      });
    },
    onError: (error: unknown) => {
      toast.error(getStandardErrorMessage(error, "Availability check failed."));
    },
  });

  return (
    <div
      data-testid="harvested-domains-panel"
      className="relative flex flex-col rounded-xl border border-base-300 bg-base-100"
    >
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Dropped domains in your industry
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={harvestNow.isPending}
            onClick={() => harvestNow.mutate()}
          >
            {harvestNow.isPending ? "Harvesting…" : "Harvest next day"}
          </Button>
        </div>

        <p className="text-xs text-base-content/60">
          Pulled from the daily deleted-domain feed and matched against your
          industry vocabulary. These already dropped — they are registerable at
          normal price unless someone has taken them since.
        </p>

        {harvestQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader size="sm" />
          </div>
        ) : harvestQuery.isError ? (
          <InlineQueryError
            message={getStandardErrorMessage(
              harvestQuery.error,
              "The harvested list could not be loaded.",
            )}
            retrying={harvestQuery.isFetching}
            onRetry={() => void harvestQuery.refetch()}
          />
        ) : (rows?.length ?? 0) === 0 ? (
          // Says what to do rather than rendering an empty box.
          <p className="py-4 text-base-content/70">
            Nothing harvested yet. Click <strong>Harvest next day</strong> to
            pull the most recent day of dropped domains — it is included in your
            subscription and costs nothing extra.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 10, 20].map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={minRating === value ? "primary" : "ghost"}
                  aria-pressed={minRating === value}
                  onClick={() => setMinRating(value)}
                >
                  {value === 0 ? "All" : `DR ${value}+`}
                </Button>
              ))}
              {uncheckedTop.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  disabled={checkAvailability.isPending}
                  onClick={() => checkAvailability.mutate()}
                >
                  {checkAvailability.isPending
                    ? "Checking…"
                    : `Check availability (${uncheckedTop.length} × ${CREDITS_PER_CHECK} credits)`}
                </Button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>DR</th>
                    <th>Availability</th>
                    <th>Matched</th>
                    <th>Dropped</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.domain}>
                      <td className="font-medium">{row.domain}</td>
                      <td className="tabular-nums">
                        {ratingLabel(row.domainRating)}
                      </td>
                      <td>{availabilityLabel(row.isAvailable)}</td>
                      <td className="text-base-content/70">
                        {row.matchedTerm}
                      </td>
                      <td className="text-base-content/70">{row.droppedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-base-content/60">
              {rows?.length ?? 0} harvested from{" "}
              {harvestQuery.data?.harvestedDates.length ?? 0} day
              {harvestQuery.data?.harvestedDates.length === 1 ? "" : "s"} ·{" "}
              {visible.length} shown · DR fills in automatically as grading runs
            </p>
          </>
        )}
      </div>
    </div>
  );
}
