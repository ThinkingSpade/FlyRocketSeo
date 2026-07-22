import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  clearGscOAuthConfig,
  getGscOAuthConfigStatus,
  setGscOAuthConfig,
} from "@/serverFunctions/gsc";

const SETUP_DOCS_URL =
  "https://github.com/ThinkingSpade/FlyRocketSeo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md";

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * Deployment-level Google OAuth client override for Search Console, editable
 * from the app (self-hosted only). Env stays the default; saving here stores an
 * encrypted override that takes precedence, so an operator can change
 * credentials without a redeploy. Renders nothing in hosted mode.
 */
export function GscOAuthConfigSection() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["gscOAuthConfigStatus"],
    queryFn: () => getGscOAuthConfigStatus(),
  });
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gscOAuthConfigStatus"] }),
      // "configured" state on each project's Search Console card derives from
      // this, so refresh those too.
      queryClient.invalidateQueries({ queryKey: ["gscConnection"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      setGscOAuthConfig({
        data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
      }),
    onSuccess: async () => {
      toast.success("Search Console credentials saved");
      setClientId("");
      setClientSecret("");
      setShowForm(false);
      await refresh();
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save credentials")),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearGscOAuthConfig(),
    onSuccess: async () => {
      toast.success("Reverted to environment credentials");
      await refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const status = statusQuery.data;
  if (!status || !status.supported) return null;

  const canSave =
    status.betterAuthSecretConfigured &&
    clientId.trim().length > 0 &&
    clientSecret.trim().length > 0 &&
    !saveMutation.isPending;

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/gsc/oauth/callback`
      : "<your-domain>/api/gsc/oauth/callback";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">
        Google Search Console
      </h2>

      <div className="space-y-3 text-sm">
        {status.source === "custom" && status.override ? (
          <p className="text-base-content/70">
            Using custom credentials — client ID{" "}
            <span className="break-all font-mono text-xs text-base-content">
              {status.override.clientId}
            </span>
            , updated {formatUpdatedAt(status.override.updatedAt)}.
          </p>
        ) : status.source === "env" ? (
          <p className="text-base-content/70">
            Using the credentials from your environment (
            <span className="font-mono text-xs">GOOGLE_CLIENT_ID</span>). You
            can override them here without a redeploy.
          </p>
        ) : (
          <p className="text-base-content/70">
            Not configured. Add your Google OAuth client to enable Search
            Console, or set it via environment variables.
          </p>
        )}

        {!status.betterAuthSecretConfigured ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-base-content">
            Set <span className="font-mono text-xs">BETTER_AUTH_SECRET</span>{" "}
            (32+ characters) first — it encrypts these credentials at rest.
          </p>
        ) : null}

        {showForm ? (
          <form
            className="space-y-3 rounded-lg border border-base-300 bg-base-200/40 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) saveMutation.mutate();
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Client ID</span>
              <input
                type="text"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="1234-abc.apps.googleusercontent.com"
                autoComplete="off"
                className="input input-bordered input-sm w-full"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Client secret</span>
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="GOCSPX-…"
                autoComplete="off"
                className="input input-bordered input-sm w-full"
              />
            </label>
            <p className="text-xs text-base-content/50">
              Add this redirect URI to your Google OAuth client:{" "}
              <span className="break-all font-mono text-base-content/70">
                {redirectUri}
              </span>
              . Need help?{" "}
              <a
                href={SETUP_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Setup guide
              </a>
              .
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowForm(false);
                  setClientId("");
                  setClientSecret("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={!canSave}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowForm(true)}
            >
              {status.source === "custom"
                ? "Replace credentials"
                : status.source === "env"
                  ? "Override in app"
                  : "Add credentials"}
            </button>
            {status.source === "custom" ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
              >
                {clearMutation.isPending
                  ? "Removing…"
                  : status.hasEnvCredentials
                    ? "Remove (revert to env)"
                    : "Remove"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
