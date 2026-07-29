import type { GscAccessFailureReason } from "@/shared/gsc";

const GSC_API_LIBRARY_URL =
  "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com";

type GscNoticeAction =
  /** No property bound yet — the honest first-run prompt. */
  | { kind: "connect"; label: string }
  /** A property IS bound but the grant is dead/denied: re-run the OAuth link. */
  | { kind: "reconnect"; label: string }
  /** The Google Cloud project has the Search Console API switched off. */
  | { kind: "enable_api"; label: string; href: string };

type GscAccessNotice = {
  title: string;
  detail?: string;
  tone: "neutral" | "warning";
  action: GscNoticeAction;
};

/**
 * What to tell the user when a Search Console read comes back empty. Only
 * `not_connected` is a genuine first-run state; every other reason means a
 * property is bound and Google refused the read, so showing the pristine
 * "Connect Search Console" prompt would be a lie (the Integrations card would
 * still say "Connected" right next to it).
 */
export function getGscAccessNotice(
  reason: GscAccessFailureReason,
): GscAccessNotice {
  switch (reason) {
    case "not_connected":
      return {
        title: "Connect Google Search Console to see clicks and impressions.",
        tone: "neutral",
        action: { kind: "connect", label: "Connect Search Console" },
      };
    case "requires_reconnect":
      return {
        title: "Your Search Console connection expired.",
        detail:
          "Google stopped accepting the saved grant, so no data can be read until you reconnect.",
        tone: "warning",
        action: { kind: "reconnect", label: "Reconnect with Google" },
      };
    case "api_not_configured":
      return {
        title:
          "Search Console API isn't enabled for your Google Cloud project.",
        detail: "Enable it, then reconnect.",
        tone: "warning",
        action: {
          kind: "enable_api",
          label: "Enable it in Google Cloud Console",
          href: GSC_API_LIBRARY_URL,
        },
      };
    case "permission_denied":
      return {
        title: "Google denied access to the connected property.",
        detail:
          "The connected Google account may have lost verified access to it, or the property was removed in Search Console.",
        tone: "warning",
        action: { kind: "reconnect", label: "Reconnect with Google" },
      };
  }
}
