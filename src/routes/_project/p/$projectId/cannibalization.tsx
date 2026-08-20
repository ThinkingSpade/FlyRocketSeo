import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CannibalizationPage } from "@/client/features/link-insights/CannibalizationPage";

/**
 * `q` is the query an inbound link is asking about -- SEO Opportunities'
 * "Review" on a consolidate row already knows it. Without a schema here that
 * link arrived blind and dropped the user at the top of an unfiltered list of
 * up to 50 cards with no anchor and no highlight.
 */
const cannibalizationSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_project/p/$projectId/cannibalization")({
  validateSearch: cannibalizationSearchSchema,
  component: CannibalizationRoute,
});

function CannibalizationRoute() {
  const { projectId } = Route.useParams();
  const { q } = Route.useSearch();
  return <CannibalizationPage projectId={projectId} focusQuery={q ?? null} />;
}
