import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OnPageFixesPage } from "@/client/features/onpage/OnPageFixesPage";

/**
 * `u` is the page an inbound link is asking about. GSC Insights' CTR table
 * tells you to rewrite a specific page's title and meta and links here to do
 * it; without a schema that link arrived blind and left the user to find the
 * page again in a list sorted by traffic.
 */
const onPageSearchSchema = z.object({
  u: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_project/p/$projectId/on-page")({
  validateSearch: onPageSearchSchema,
  component: OnPageRoute,
});

function OnPageRoute() {
  const { projectId } = Route.useParams();
  const { u } = Route.useSearch();
  return <OnPageFixesPage projectId={projectId} focusUrl={u ?? null} />;
}
