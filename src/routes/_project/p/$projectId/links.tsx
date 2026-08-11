import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LinkOpportunitiesPage } from "@/client/features/link-insights/LinkOpportunitiesPage";

/**
 * `q` is the query an inbound link is asking about. Every card here is headed
 * by one, so without a schema this tab could only ever be opened at the top of
 * the pile — and it is the answer to "which of my own pages should link to
 * this one", which several tabs raise and none could hand over.
 *
 * `.catch(undefined)` rather than a failing parse: a stale link must land on
 * the full list, never on an error.
 */
const linksSearchSchema = z.object({
  q: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_project/p/$projectId/links")({
  validateSearch: linksSearchSchema,
  component: LinksRoute,
});

function LinksRoute() {
  const { projectId } = Route.useParams();
  const { q } = Route.useSearch();
  return <LinkOpportunitiesPage projectId={projectId} focusQuery={q ?? null} />;
}
