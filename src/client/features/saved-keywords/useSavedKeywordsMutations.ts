import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  refreshSavedKeywordMetrics,
  removeSavedKeywords,
  updateSavedKeywordTags,
} from "@/serverFunctions/keywords";

/**
 * The three write paths off the Saved Keywords table.
 *
 * Grouped here rather than in the route because they share one invalidation
 * (`["savedKeywords", projectId]`, the prefix the list, the tag rail and the
 * portfolio strip all hang off) and differ only in their toasts. The route
 * keeps the state each one resets, and passes it back in as callbacks.
 */
export function useSavedKeywordsMutations(args: {
  projectId: string;
  onRemoved: () => void;
  onRemoveFailed: (message: string) => void;
  onTagged: () => void;
}) {
  const queryClient = useQueryClient();
  const { projectId } = args;
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["savedKeywords", projectId],
    });

  const remove = useMutation({
    mutationFn: (savedKeywordIds: string[]) =>
      removeSavedKeywords({ data: { projectId, savedKeywordIds } }),
    onSuccess: (result) => {
      args.onRemoved();
      invalidate();
      captureClientEvent("saved_keywords:bulk_remove", {
        count: result.deletedCount,
      });
      toast.success(
        `${result.deletedCount} keyword${result.deletedCount !== 1 ? "s" : ""} removed`,
      );
    },
    onError: (error) => {
      args.onRemoveFailed(getStandardErrorMessage(error, "Remove failed."));
    },
  });

  const tag = useMutation({
    mutationFn: (input: {
      savedKeywordIds: string[];
      addTags?: string[];
      removeTagIds?: string[];
    }) => updateSavedKeywordTags({ data: { projectId, ...input } }),
    onSuccess: (result) => {
      args.onTagged();
      invalidate();
      toast.success(
        `Updated tags for ${result.taggedCount} keyword${result.taggedCount !== 1 ? "s" : ""}`,
      );
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Could not update tags"));
    },
  });

  const refreshMetrics = useMutation({
    mutationFn: () => refreshSavedKeywordMetrics({ data: { projectId } }),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        `Updated stats for ${result.updated} keyword${result.updated !== 1 ? "s" : ""}`,
      );
    },
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(error, "Could not update keyword stats."),
      );
    },
  });

  return { remove, tag, refreshMetrics };
}
