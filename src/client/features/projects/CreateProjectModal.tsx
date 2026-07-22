import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { startGscLink } from "@/client/features/gsc/startGscLink";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { setLastProjectId } from "@/client/lib/active-project";
import { createProject } from "@/serverFunctions/projects";
import { getGscConnection } from "@/serverFunctions/gsc";

type CreatedProject = { id: string; name: string };

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  // Once set, the modal advances to the "connect Search Console" step for the
  // just-created project. The project already exists at this point, so closing
  // the modal just lands the user on it.
  const [created, setCreated] = React.useState<CreatedProject | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        data: { name: name.trim(), domain: domain.trim() || undefined },
      }),
    onSuccess: async (project) => {
      setLastProjectId(project.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
      setCreated({ id: project.id, name: name.trim() });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to create project")),
  });

  const isPending = createMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    createMutation.mutate();
  };

  const goToProject = (projectId: string) => {
    onClose();
    void navigate({ to: "/p/$projectId", params: { projectId } });
  };

  if (created) {
    return (
      <ConnectSearchConsoleStep
        project={created}
        onSkip={() => goToProject(created.id)}
        onPickProperty={() => {
          onClose();
          void navigate({
            to: "/p/$projectId/settings",
            params: { projectId: created.id },
            hash: "search-console",
          });
        }}
      />
    );
  }

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={isPending ? undefined : onClose}
      labelledBy="create-project-title"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 id="create-project-title" className="text-lg font-semibold">
          New project
        </h2>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Inc."
            maxLength={120}
            autoFocus
            className="input input-bordered w-full"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Domain <span className="text-base-content/50">(optional)</span>
          </span>
          <input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            maxLength={255}
            className="input input-bordered w-full"
          />
          <span className="text-xs text-base-content/50">
            Next, you can connect this client's Google Search Console.
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isPending}
          >
            {isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConnectSearchConsoleStep({
  project,
  onSkip,
  onPickProperty,
}: {
  project: CreatedProject;
  onSkip: () => void;
  onPickProperty: () => void;
}) {
  const connectionQuery = useQuery({
    queryKey: ["gscConnection", project.id],
    queryFn: () => getGscConnection({ data: { projectId: project.id } }),
  });
  const connection = connectionQuery.data;
  const configured = connection?.googleOAuthConfigured ?? false;

  const startConnect = () => {
    // Redirects the whole page to Google's consent screen and returns to this
    // project's property picker — the grant is account-wide, but each project
    // binds its own Search Console property, so clients stay separated.
    void startGscLink(
      `${window.location.origin}/p/${project.id}/settings#search-console`,
    );
  };

  return (
    <Modal maxWidth="max-w-md" onClose={onSkip} labelledBy="connect-gsc-title">
      <div className="space-y-1">
        <h2 id="connect-gsc-title" className="text-lg font-semibold">
          Connect Search Console
        </h2>
        <p className="text-sm text-base-content/70">
          Bring {project.name}'s real Google clicks, impressions, and rankings
          into FlyRocketSEO — it's free and never uses credits. Each client
          connects its own property.
        </p>
      </div>

      {connectionQuery.isPending ? (
        <div className="flex items-center gap-2 py-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" />
          Checking…
        </div>
      ) : !configured ? (
        <p className="rounded-lg border border-base-300 bg-base-200/50 px-3 py-2 text-sm text-base-content/70">
          Search Console isn't set up on this server yet. Once Google OAuth is
          configured, you can connect it from this project's settings.
        </p>
      ) : null}

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}>
          {configured ? "Skip for now" : "Go to project"}
        </button>
        {configured ? (
          connection?.currentUserHasGrant ? (
            <button
              type="button"
              onClick={onPickProperty}
              className="btn btn-primary btn-sm gap-2"
            >
              <GoogleGlyph className="size-4" />
              Choose property
            </button>
          ) : (
            <button
              type="button"
              onClick={startConnect}
              className="inline-flex items-center justify-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200"
            >
              <GoogleGlyph className="size-[18px]" />
              Connect with Google
            </button>
          )
        ) : null}
      </div>
    </Modal>
  );
}
