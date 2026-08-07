import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Send,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  listGbpScheduledPosts,
  publishDueGbpPosts,
  publishGbpPostNow,
} from "@/serverFunctions/gbp";
import type { GbpScheduledPostStatus } from "./gbpPostSchedule";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

const STATUS_ICON: Record<GbpScheduledPostStatus, typeof CheckCircle2> = {
  draft: CircleDashed,
  scheduled: CircleDashed,
  publishing: Loader2,
  published: CheckCircle2,
  failed: XCircle,
};

const STATUS_TONE: Record<
  GbpScheduledPostStatus,
  "neutral" | "primary" | "success" | "error"
> = {
  draft: "neutral",
  scheduled: "primary",
  publishing: "primary",
  published: "success",
  failed: "error",
};

const STATUS_LABEL: Record<GbpScheduledPostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Published",
  failed: "Failed",
};

/**
 * Scheduled-posts queue + the one action that actually fires Google-side
 * writes for this list: "Publish due posts now". There is no background
 * cron -- see GbpWriteService.publishDuePosts's doc comment -- so this
 * button, and the per-row "Publish now", are the ONLY ways a post ever
 * reaches Google, and both require their own explicit confirm.
 */
export function GbpScheduledPostsList({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [confirmingPostId, setConfirmingPostId] = React.useState<string | null>(
    null,
  );
  const [confirmingBulk, setConfirmingBulk] = React.useState(false);

  const postsQuery = useQuery({
    queryKey: ["gbpScheduledPosts", projectId],
    queryFn: () => listGbpScheduledPosts({ data: { projectId } }),
  });
  const posts = postsQuery.data ?? [];
  const dueCount = posts.filter(
    (post) =>
      post.status === "scheduled" &&
      new Date(post.scheduledAt).getTime() <= Date.now(),
  ).length;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["gbpScheduledPosts", projectId],
    });

  const publishOneMutation = useMutation({
    mutationFn: (postId: string) =>
      publishGbpPostNow({ data: { projectId, postId } }),
    onSuccess: (result) => {
      setConfirmingPostId(null);
      if (result.ok) toast.success("Post published");
      else toast.error(result.message);
      void invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const publishDueMutation = useMutation({
    mutationFn: () => publishDueGbpPosts({ data: { projectId } }),
    onSuccess: (result) => {
      setConfirmingBulk(false);
      if (result.attempted === 0) {
        toast.message("Nothing was due to publish.");
      } else if (result.failed === 0) {
        toast.success(`Published ${result.published} post(s).`);
      } else {
        toast.message(
          `${result.published} of ${result.attempted} published; ${result.failed} failed.`,
        );
      }
      void invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (postsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/50">
        <Loader size="sm" />
        Loading scheduled posts…
      </div>
    );
  }

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={Send} tone="neutral" />
            Scheduled posts
          </h2>
          {confirmingBulk ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs">
              <TriangleAlert className="size-3.5 shrink-0 text-warning" />
              <span>Publish {dueCount} due post(s) to Google now?</span>
              <Button
                type="button"
                variant="primary"
                size="xs"
                disabled={publishDueMutation.isPending}
                onClick={() => publishDueMutation.mutate()}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setConfirmingBulk(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dueCount === 0}
              onClick={() => setConfirmingBulk(true)}
            >
              <Send className="size-3.5" />
              Publish due posts now
              {dueCount > 0 ? ` (${dueCount})` : ""}
            </Button>
          )}
        </div>

        {posts.length === 0 ? (
          <p className="text-sm text-base-content/60">Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-base-300">
            {posts.map((post) => (
              <li key={post.id} className="flex items-start gap-2 py-2.5">
                <InsightIcon
                  icon={STATUS_ICON[post.status]}
                  tone={STATUS_TONE[post.status]}
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{post.content}</p>
                  <p className="mt-0.5 text-xs text-base-content/50">
                    {STATUS_LABEL[post.status]} ·{" "}
                    {new Date(post.scheduledAt).toLocaleString()}
                  </p>
                  {post.status === "failed" && post.errorMessage ? (
                    <p className="mt-0.5 text-xs text-error">
                      {post.errorMessage}
                    </p>
                  ) : null}
                </div>
                {post.status === "scheduled" ? (
                  confirmingPostId === post.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="xs"
                        disabled={publishOneMutation.isPending}
                        onClick={() => publishOneMutation.mutate(post.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmingPostId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="shrink-0"
                      onClick={() => setConfirmingPostId(post.id)}
                    >
                      Publish now
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
