import { useQuery } from "@tanstack/react-query";
import { useGbpWriteAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import { getGbpConnection } from "@/serverFunctions/gbp";
import { GbpConnectionCard } from "./GbpConnectionCard";
import { GbpPostComposer } from "./GbpPostComposer";
import { GbpScheduledPostsList } from "./GbpScheduledPostsList";

/**
 * GBP writing, assembled: the connection card always renders (it owns every
 * capability/connection state, including the honest "not configured yet"
 * one); the composer and scheduled-posts queue only join once this project
 * actually has a usable connection, so there's nothing to compose a post
 * INTO before a location is picked.
 */
export function GbpWriteSection({ projectId }: { projectId: string }) {
  const gbpWriteAvailable = useGbpWriteAvailable();
  // Same query key GbpConnectionCard itself uses -- react-query dedupes this
  // to the one request, not two.
  const connectionQuery = useQuery({
    queryKey: ["gbpConnection", projectId],
    queryFn: () => getGbpConnection({ data: { projectId } }),
    enabled: gbpWriteAvailable,
  });
  const connected = Boolean(connectionQuery.data?.connected);

  return (
    <div className="flex flex-col gap-3">
      <GbpConnectionCard projectId={projectId} />
      {gbpWriteAvailable && connected ? (
        <>
          <GbpPostComposer projectId={projectId} />
          <GbpScheduledPostsList projectId={projectId} />
        </>
      ) : null}
    </div>
  );
}
