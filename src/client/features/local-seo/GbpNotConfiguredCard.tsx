import { MapPin } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";

/**
 * Shown whenever `gbpWriteAvailable` is false. isGbpWriteConfigured() only
 * checks what it CAN check server-side (GBP_GOOGLE_CLIENT_ID/SECRET,
 * BETTER_AUTH_SECRET) and collapses that into one boolean -- it has no way
 * to tell which of those specifically is missing, and no way at all to know
 * whether Google's scope + verification review is done (see its own doc
 * comment). Finding A6: the copy here used to assert that ALL THREE setup
 * steps (scope, verification, both client vars) remain outstanding even when
 * only one env var was the actual cause -- and never mentioned
 * BETTER_AUTH_SECRET at all, even though it's a real, independent cause of
 * `false`. Fixed to describe the full requirement honestly instead of
 * asserting which specific pieces are done or not done.
 *
 * Kept in its own file, with no imports beyond lucide-react/InsightTile
 * (deliberately no hooks, no server-function client), so this leaf,
 * data-free component can be rendered in a test without dragging in
 * GbpConnectionCard's react-query/server-function import graph (which
 * reaches `cloudflare:workers` and `@/db` transitively).
 */
export function NotConfiguredCard() {
  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={MapPin} tone="neutral" />
          Google Business Profile writing
        </h2>
        <p className="text-sm text-base-content/70">
          Connecting would let you schedule and publish Google Business Profile
          posts, and push fixes for the profile audit above (description,
          categories) straight to Google — directly from this tab.
        </p>
        <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-xs text-base-content/60">
          <p className="font-medium text-base-content/70">
            Not available yet on this deployment
          </p>
          <p className="mt-1">
            Turning this on requires Google&apos;s restricted{" "}
            <code className="font-mono">business.manage</code> scope (added to
            this app&apos;s OAuth consent screen, with Google&apos;s
            verification review completed) plus{" "}
            <code className="font-mono">GBP_GOOGLE_CLIENT_ID</code>,{" "}
            <code className="font-mono">GBP_GOOGLE_CLIENT_SECRET</code>, and a{" "}
            <code className="font-mono">BETTER_AUTH_SECRET</code> set for this
            deployment (see .env.example). At least one of these isn&apos;t in
            place yet here -- ask your operator to check which.
          </p>
        </div>
      </div>
    </div>
  );
}
