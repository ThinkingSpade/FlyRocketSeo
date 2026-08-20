import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedHome } from "@/client/features/home/AuthenticatedHome";
import { LandingPage } from "@/client/features/landing/LandingPage";
import { LoadingShell } from "@/client/components/LoadingShell";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

/**
 * The one public route in the app.
 *
 * Everything else sits under `_app`, whose guard sends a visitor without a
 * session to /sign-in. That is right for a deep link — you want to land back
 * where you were pointed — and wrong for the front door, where a stranger
 * should be told what this is rather than handed a password field. So "/" owns
 * both branches itself instead of living inside that layout.
 *
 * Only hosted mode has a signed-out state to speak of. Under
 * `cloudflare_access` the Worker sits behind Access and a request that reaches
 * this code has already been authenticated; under `local_noauth` there is no
 * session to miss. In both, the landing page would be a door with no wall
 * around it, so those modes keep the old behaviour exactly.
 */
const TITLE = "FlyRocketSEO — SEO research and reporting for one team";
const DESCRIPTION =
  "A private SEO research and reporting tool: keyword research, rank tracking, backlinks, site audits and client reports, with every paid lookup priced before it runs.";

export const Route = createFileRoute("/")({
  component: RootEntry,
  /**
   * This is the head the SPA shell prerenders, because the shell is built by
   * fetching "/" — so these tags are the ones a crawler or a link unfurler
   * actually sees. Every other route's head only ever exists client-side.
   *
   * The body is a different matter: <body> is ClientOnly in __root, so the
   * prerendered HTML carries this head and a loading shell, not the page copy.
   * Making the copy itself crawlable would mean restructuring how the app
   * boots, which is a bigger change than a private tool's front door warrants.
   */
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "FlyRocketSEO" },
      { property: "og:image", content: "/logo-mark.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
  }),
});

function RootEntry() {
  const isHosted = isHostedClientAuthMode();
  const { data: session, isPending } = useSession();

  if (!isHosted) return <AuthenticatedHome />;

  // The session answer decides which of two entirely different pages this is,
  // so nothing is rendered until it lands. LoadingShell rather than null: it is
  // what the prerendered shell already paints, so this is a continuation of the
  // first frame rather than a second one.
  if (isPending) return <LoadingShell />;

  return session?.user?.id ? <AuthenticatedHome /> : <LandingPage />;
}
