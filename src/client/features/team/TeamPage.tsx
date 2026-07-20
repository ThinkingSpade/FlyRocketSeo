import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  createInvite,
  listInvites,
  revokeInvite,
} from "@/serverFunctions/invites";

const INVITES_QUERY_KEY = ["teamInvites"] as const;

export function TeamPage() {
  const isHosted = isHostedClientAuthMode();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{
    inviteUrl: string;
    emailSent: boolean;
  } | null>(null);
  const invitesQuery = useQuery({
    queryKey: INVITES_QUERY_KEY,
    queryFn: () => listInvites(),
    enabled: isHosted,
  });
  const createMutation = useMutation({
    mutationFn: (inviteEmail: string) =>
      createInvite({ data: { email: inviteEmail } }),
    onSuccess: async (result) => {
      setCreatedInvite(result);
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY });
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't create the invitation."),
      ),
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvite({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY });
      toast.success("Invitation revoked");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't revoke the invitation."),
      ),
  });

  if (!isHosted) {
    return null;
  }

  const invites = invitesQuery.data ?? [];

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Invite trusted teammates to this shared workspace.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-base-content/50">
            Create an invitation
          </h2>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate(email);
            }}
          >
            <input
              type="email"
              className="input input-bordered min-w-0 flex-1"
              placeholder="teammate@example.com"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              autoComplete="email"
              required
              maxLength={320}
              disabled={createMutation.isPending}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending || email.trim() === ""}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {createMutation.isPending ? "Creating…" : "Create invite"}
            </button>
          </form>

          {createdInvite ? (
            <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
              <div className="flex items-start gap-2">
                <input
                  className="input input-sm input-bordered min-w-0 flex-1 font-mono text-xs"
                  value={createdInvite.inviteUrl}
                  readOnly
                  aria-label="Invitation link"
                />
                <CopyButton
                  value={createdInvite.inviteUrl}
                  successMessage="Invitation link copied"
                />
              </div>
              <p className="mt-2 text-xs text-base-content/60">
                {createdInvite.emailSent
                  ? "Email was sent. You can also copy this link."
                  : "Copy this link and send it to them."}
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-base-content/50">
            Invitations
          </h2>
          {invitesQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : invitesQuery.isError ? (
            <p className="text-sm text-error">
              {getStandardErrorMessage(
                invitesQuery.error,
                "We couldn't load invitations.",
              )}
            </p>
          ) : invites.length === 0 ? (
            <p className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/55">
              No invitations yet.
            </p>
          ) : (
            <ul className="divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300">
              {invites.map((invite) => {
                const isCanceled = invite.status === "canceled";
                const isExpired =
                  new Date(invite.expiresAt).getTime() <= Date.now();
                const displayStatus = isExpired ? "expired" : invite.status;

                return (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-medium"
                          data-ph-mask
                        >
                          {invite.email}
                        </span>
                        <span className="badge badge-sm badge-ghost capitalize">
                          {displayStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-base-content/50">
                        Expires {formatDate(invite.expiresAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm shrink-0 text-error"
                      onClick={() => revokeMutation.mutate(invite.id)}
                      disabled={isCanceled || revokeMutation.isPending}
                    >
                      {isCanceled ? "Revoked" : "Revoke"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
