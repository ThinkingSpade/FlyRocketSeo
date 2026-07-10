import { useState } from "react";
import { Check, Copy, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  createReportShare,
  listReportShares,
  revokeReportShare,
} from "@/serverFunctions/report";
import type { ReportShareSnapshot } from "@/types/schemas/report";
import type { ReportRangeKey } from "./reportData";

function sharesQueryKey(projectId: string) {
  return ["reportShares", projectId] as const;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/r/${token}`;
}

/**
 * Create and manage public share links. Each link freezes the report as it
 * looks right now — recipients see stored data only, so sharing never spends
 * API credits and revoking a link kills it immediately.
 */
export function ShareModal({
  projectId,
  rangeKey,
  buildSnapshot,
  onClose,
}: {
  projectId: string;
  rangeKey: ReportRangeKey;
  /** Assembles the current on-screen report; null while data is loading. */
  buildSnapshot: () => ReportShareSnapshot | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sharesQuery = useQuery({
    queryKey: sharesQueryKey(projectId),
    queryFn: () => listReportShares({ data: { projectId } }),
  });
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: sharesQueryKey(projectId) });

  const createMutation = useMutation({
    mutationFn: () => {
      const snapshot = buildSnapshot();
      if (!snapshot) {
        throw new Error("The report is still loading — try again in a moment.");
      }
      return createReportShare({
        data: {
          projectId,
          rangeKey,
          // Clamp to the share-title cap: projectTitle allows up to 255 but the
          // share title caps at 160, and a long domain shouldn't fail creation.
          title: snapshot.projectTitle.slice(0, 160),
          snapshot,
        },
      });
    },
    onSuccess: (share) => {
      void invalidate();
      setFreshToken(share.token);
      captureClientEvent("report:share_create");
      void navigator.clipboard.writeText(shareUrl(share.token));
      toast.success("Share link created and copied");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const revokeMutation = useMutation({
    mutationFn: (shareId: string) =>
      revokeReportShare({ data: { projectId, shareId } }),
    onSuccess: () => {
      void invalidate();
      captureClientEvent("report:share_revoke");
      toast.success("Share link revoked");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const copyLink = (token: string) => {
    void navigator.clipboard.writeText(shareUrl(token));
    toast.success("Link copied");
  };

  const shares = sharesQuery.data ?? [];

  return (
    <Modal
      onClose={onClose}
      labelledBy="report-share-title"
      maxWidth="max-w-lg"
    >
      <div>
        <h3
          id="report-share-title"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Share2 className="size-4" />
          Share this report
        </h3>
        <p className="text-xs text-base-content/60">
          Anyone with a link sees a read-only snapshot frozen at the moment you
          create it — future data changes and revoked links never leak.
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-sm w-fit gap-1.5"
        disabled={createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        {createMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Link2 className="size-3.5" />
        )}
        Create share link
      </button>

      {freshToken ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2">
          <Check className="size-4 shrink-0 text-success" />
          <code className="min-w-0 flex-1 truncate text-xs">
            {shareUrl(freshToken)}
          </code>
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => copyLink(freshToken)}
          >
            <Copy className="size-3" />
            Copy
          </button>
        </div>
      ) : null}

      {sharesQuery.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-4 animate-spin text-base-content/50" />
        </div>
      ) : shares.length === 0 ? (
        <p className="text-xs text-base-content/50">
          No share links yet for this project.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {shares.map((share) => {
            const revoked = share.revokedAt !== null;
            return (
              <li
                key={share.id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-base-200/60"
              >
                <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-base-content/50">
                  {new Date(share.createdAt).toLocaleDateString()}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${revoked ? "text-base-content/40 line-through" : ""}`}
                  title={share.title}
                >
                  {share.title}
                </span>
                <span className="shrink-0 text-[11px] uppercase text-base-content/40">
                  {share.rangeKey}
                </span>
                {revoked ? (
                  <span className="badge badge-ghost badge-sm shrink-0">
                    Revoked
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs shrink-0 gap-1"
                      onClick={() => copyLink(share.token)}
                    >
                      <Copy className="size-3" />
                      Copy
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs shrink-0 px-1.5 text-base-content/40 hover:text-error"
                      aria-label={`Revoke share link: ${share.title}`}
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(share.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-base-content/40">
        Self-hosting behind Cloudflare Access? Add a bypass policy for
        <code className="mx-1">/r/*</code>and
        <code className="mx-1">/api/report-share/*</code>so recipients outside
        your team can open links.
      </p>

      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
