import { createFileRoute } from "@tanstack/react-router";
import { PublicReportPage } from "@/client/features/report/PublicReportPage";

// Public shared-report viewer — intentionally OUTSIDE the authenticated
// layouts: possession of the token is the entire capability.
export const Route = createFileRoute("/r/$token")({
  // Capability URLs must never be indexed if one leaks (referrer, history
  // sync, a paste). The API is already noindex; this covers the page itself.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: PublicReportRoute,
});

function PublicReportRoute() {
  const { token } = Route.useParams();
  return <PublicReportPage token={token} />;
}
