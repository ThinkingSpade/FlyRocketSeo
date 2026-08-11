import { Warning } from "@phosphor-icons/react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";
import { Banner } from "@cloudflare/kumo/components/banner";

/**
 * Shown in self-hosted deployments that haven't set GOOGLE_CLIENT_ID/SECRET yet
 * — in both the Integrations card and the onboarding step.
 *
 * Banner's structured `title`/`description`/`action` props rather than its
 * children, which are deprecated and, here, were invalid: Banner puts children
 * inside a <p>, and this passed it a <div> wrapping two more <p>s. React caught
 * it as a hydration error on every render of the Settings and Search Console
 * pages. Nesting is the reason, not style — `action` is a sibling slot, so the
 * link sits outside the paragraph rather than inside it.
 */
export function SelfHostedSetupWarning() {
  return (
    <Banner
      variant="alert"
      className="items-start text-sm"
      icon={<Warning className="mt-0.5 size-4 shrink-0" />}
      title="Google OAuth client not configured"
      description="Add your Google client ID and secret to this FlyRocketSEO deployment before connecting Search Console."
      action={
        <SafeExternalLink
          url={GSC_SELF_HOSTED_SETUP_DOCS_URL}
          label="Open setup guide"
          className="inline-flex items-center gap-1 font-medium whitespace-nowrap underline underline-offset-2"
        />
      }
    />
  );
}
