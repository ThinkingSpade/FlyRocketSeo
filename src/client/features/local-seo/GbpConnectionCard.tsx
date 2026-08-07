import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { InsightIcon } from "@/client/components/InsightTile";
import { useGbpCapabilityState } from "@/client/features/auth/useEmailVerificationBypassed";
import {
  disconnectGbp,
  getGbpConnection,
  listGbpLocations,
  setGbpConnection,
} from "@/serverFunctions/gbp";
import { startGbpLink } from "./startGbpLink";
import { GbpLocationPicker } from "./GbpLocationPicker";
import { NotConfiguredCard } from "./GbpNotConfiguredCard";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

/**
 * Connect/manage card for GBP writing. Three states, in order of precedence:
 *  1. Capability absent (operator hasn't configured GBP_GOOGLE_CLIENT_ID) --
 *     explains what connecting WOULD enable and exactly what the operator
 *     must do. No button: one that can't work is worse than none (see the
 *     task brief this branch follows).
 *  2. Capability present, this project not connected -- a real "Connect"
 *     button (or, once the user has a grant but hasn't picked a location, the
 *     picker).
 *  3. Connected -- which location, who connected it, and a way to change or
 *     disconnect.
 *
 * ICON RULE: bare muted lucide glyphs via InsightIcon, no chip/pill
 * backgrounds -- unlike SearchConsoleConnectionCard's StatusPill, which
 * predates that rule.
 */
export function GbpConnectionCard({ projectId }: { projectId: string }) {
  // Final wave item 3 (an A6 residual): distinguishes "still confirming
  // against the live Worker config" from "confirmed unavailable" -- see
  // resolveGbpCapabilityState's own doc comment. Both `enabled:` gates below
  // still only need the boolean (queries stay off for "checking" AND
  // "unavailable" alike), but the RENDER branch below needs the distinction,
  // since it decides between a neutral loading state and NotConfiguredCard's
  // confident "isn't in place yet" copy.
  const capabilityState = useGbpCapabilityState();
  const gbpWriteAvailable = capabilityState === "available";
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [selectedLocationName, setSelectedLocationName] = React.useState("");

  const connectionKey = ["gbpConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getGbpConnection({ data: { projectId } }),
    enabled: gbpWriteAvailable,
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const showPicker =
    picking || (connection?.currentUserHasGrant === true && !connected);

  const locationsQuery = useQuery({
    queryKey: ["gbpLocations", projectId],
    queryFn: () => listGbpLocations({ data: { projectId } }),
    enabled: Boolean(gbpWriteAvailable && showPicker),
    retry: false,
  });

  const setConnectionMutation = useMutation({
    // Both the location AND its account's resource name are required --
    // publishing later composes the v4 localPosts parent by joining them
    // (see GbpWriteService.publishPost), so saving one without the other
    // would silently produce a connection posts can never publish to.
    mutationFn: (input: { locationName: string; accountName: string }) =>
      setGbpConnection({ data: { projectId, ...input } }),
    onSuccess: () => {
      toast.success("Google Business Profile connected");
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGbp({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Google Business Profile disconnected");
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: connectionKey });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (capabilityState === "checking") {
    // Must not render NotConfiguredCard's "at least one of these isn't in
    // place yet" here (final wave item 3): that claim hasn't been
    // established yet, only the boolean gate has -- a neutral loading state
    // is the honest thing to show while the live check is still in flight.
    return (
      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={MapPin} tone="neutral" />
            Google Business Profile writing
          </h2>
          <div className="flex items-center gap-2 text-sm text-base-content/50">
            <Loader size="sm" />
            Checking…
          </div>
        </div>
      </div>
    );
  }
  if (capabilityState === "unavailable") {
    return <NotConfiguredCard />;
  }

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={MapPin} tone="neutral" />
          Google Business Profile writing
        </h2>

        {connectionQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-base-content/50">
            <Loader size="sm" />
            Checking…
          </div>
        ) : connected && !picking ? (
          <ConnectedState
            locationName={connection?.locationName ?? ""}
            connectedByEmail={connection?.connectedByEmail ?? null}
            onChange={() => {
              setSelectedLocationName(connection?.locationName ?? "");
              setPicking(true);
            }}
            onDisconnect={() => disconnectMutation.mutate()}
            disconnecting={disconnectMutation.isPending}
          />
        ) : showPicker ? (
          <GbpLocationPicker
            loading={locationsQuery.isLoading}
            errorReason={
              locationsQuery.data?.errorReason ??
              (locationsQuery.isError ? "temporary" : null)
            }
            incomplete={locationsQuery.data?.incomplete ?? false}
            locations={locationsQuery.data?.locations ?? []}
            selectedLocationName={selectedLocationName}
            onSelect={setSelectedLocationName}
            onSave={() => {
              // The <select> only carries the location's own name -- look up
              // the full candidate to recover its account resource name too.
              const location = locationsQuery.data?.locations.find(
                (candidate) => candidate.name === selectedLocationName,
              );
              if (location) {
                setConnectionMutation.mutate({
                  locationName: location.name,
                  accountName: location.accountName,
                });
              }
            }}
            saving={setConnectionMutation.isPending}
            onReconnect={() => void startGbpLink(window.location.href)}
            onRetry={() => void locationsQuery.refetch()}
            secondaryAction={
              connected
                ? { label: "Cancel", onClick: () => setPicking(false) }
                : {
                    label: "Disconnect",
                    destructive: true,
                    disabled: disconnectMutation.isPending,
                    onClick: () => disconnectMutation.mutate(),
                  }
            }
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-base-content/70">
              Connect Google Business Profile to schedule posts and push fixes
              from the audit above straight to Google.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => void startGbpLink(window.location.href)}
            >
              <InsightIcon icon={MapPin} tone="neutral" />
              Connect Google Business Profile
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectedState({
  locationName,
  connectedByEmail,
  onChange,
  onDisconnect,
  disconnecting,
}: {
  locationName: string;
  connectedByEmail: string | null;
  onChange: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
        <p className="truncate font-mono text-xs">{locationName}</p>
        {connectedByEmail ? (
          <p className="mt-0.5 truncate text-xs text-base-content/55">
            Connected by {connectedByEmail}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>
          Change location
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-error hover:bg-error/10"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
