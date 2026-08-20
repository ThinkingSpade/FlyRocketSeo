import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Buildings, CaretUpDown, CircleNotch } from "@phosphor-icons/react";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { toast } from "sonner";
import { clearLastProjectId } from "@/client/lib/active-project";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { listWorkspaces, switchWorkspace } from "@/serverFunctions/workspaces";
import { getWorkspaceChoice } from "./workspace-choice";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/**
 * The workspace this session is standing in, and a way to stand somewhere else.
 *
 * It sits directly above the project switcher because that is the hierarchy:
 * a workspace holds projects, and the project switcher only ever lists the
 * current workspace's. It is styled a step quieter than that control — no
 * border, smaller type — so the pair reads as context above the thing you
 * actually operate, rather than as two peers.
 *
 * Most of the time it renders nothing. See `getWorkspaceChoice`.
 */
export function WorkspaceSwitcher({
  onCloseDrawer,
}: {
  // Mobile sidebar passes this so switching also closes the drawer overlay,
  // matching ProjectSwitcher.
  onCloseDrawer?: () => void;
}) {
  const queryClient = useQueryClient();
  const listingQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: () => listWorkspaces(),
    // Only a hosted session can hold an active organization. The other modes
    // re-derive a per-user delegated one on every request, so there is nothing
    // to list and nothing to switch — asking would spend a round trip per page
    // load to be told so.
    enabled: isHostedClientAuthMode(),
    // Membership changes are rare and arrive by invitation, not from this tab.
    staleTime: 5 * 60 * 1000,
  });

  const switchMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      switchWorkspace({ data: { workspaceId } }),
    onSuccess: () => {
      // The remembered project belongs to the workspace we just left, and the
      // landing redirect would otherwise try to reopen it.
      clearLastProjectId();

      // `clear`, not `invalidateQueries`: invalidation keeps the cached rows
      // and marks them stale, so every mounted list would go on rendering the
      // previous workspace's data until its refetch lands. Dropping the cache
      // makes those components fall back to their pending state instead. The
      // project list is only the loudest example — it is keyed ["projects"]
      // with no workspace in the key, and so is most other cross-project data.
      queryClient.clear();

      // A full document load rather than a router navigation. React Query is
      // not the only place the old workspace lives: component state survives a
      // route change unless the tree is keyed (see the note in the project
      // layout route about a paid run authorized under one project firing
      // under another), and the same reasoning applies with more at stake
      // across a tenant boundary. Sign-out — the other identity change in this
      // app — reloads for the same reason. "/" then picks a project that
      // actually exists in the new workspace, which the projectId in the
      // current URL does not.
      window.location.assign("/");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't switch workspace."),
      ),
  });

  const choice = getWorkspaceChoice(listingQuery.data);

  if (!choice) {
    return null;
  }

  const isPending = switchMutation.isPending;

  const handleSelect = (workspaceId: string) => {
    onCloseDrawer?.();
    if (workspaceId === choice.active?.id || isPending) return;
    switchMutation.mutate(workspaceId);
  };

  return (
    <div className="pb-1">
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <button
              type="button"
              aria-label="Switch workspace"
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-base-content/60 transition-colors hover:bg-base-300/50 hover:text-base-content"
            >
              {isPending ? (
                <CircleNotch className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <Buildings className="size-3.5 shrink-0" />
              )}
              <span className="truncate font-medium">
                {choice.active?.name ?? "Choose workspace"}
              </span>
              <CaretUpDown className="ml-auto size-3 shrink-0 text-base-content/40" />
            </button>
          }
        />

        {/* Same positioning contract as ProjectSwitcher: the menu portals out
            of the sidebar, so --anchor-width is what "as wide as the trigger"
            means, and min-width lets a long workspace name exceed it. */}
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="min-w-(--anchor-width)"
        >
          <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
          {choice.workspaces.map((workspace) => (
            <DropdownMenu.Item
              key={workspace.id}
              selected={workspace.id === choice.active?.id}
              disabled={isPending}
              onClick={() => handleSelect(workspace.id)}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Buildings className="size-4 shrink-0 text-base-content/50" />
                <span className="truncate">{workspace.name}</span>
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
}
