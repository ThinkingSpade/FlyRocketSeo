import { CalendarX } from "lucide-react";
import { AppPageShell } from "@/client/components/AppPageShell";
import { ExpiredDomainsPanel } from "@/client/features/expired-domains/ExpiredDomainsPanel";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { Banner } from "@cloudflare/kumo/components/banner";

export function ExpiredDomainsPage({ projectId }: { projectId: string }) {
  const domain = useProjectDomain(projectId);

  return (
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <CalendarX className="size-6" />
          Expired Domains
        </h1>
        <p className="mt-1 text-sm text-base-content/70">
          Domains in your niche that have lapsed or are about to — reclaim the
          link, or buy the domain.
        </p>
      </div>

      {/* Stated plainly rather than left for the user to infer from thin
          results: this searches the project's own link and SERP graph, not the
          whole expired-domain universe. A food blog linking to a competitor
          will show up; an unrelated lapsed domain will not. */}
      <p className="text-xs text-base-content/60">
        Candidates come from your competitors and the domains linking to them.
        This finds domains connected to your niche — it does not scan every
        expired domain on the internet.
      </p>

      {domain ? (
        <ExpiredDomainsPanel projectId={projectId} domain={domain} />
      ) : (
        <Banner variant="default">
          Set this project&apos;s domain in Settings to search for expired
          domains in your niche.
        </Banner>
      )}
    </AppPageShell>
  );
}
