import { ShieldAlert } from "lucide-react";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";

const README_CLOUDFLARE_ACCESS_URL =
  "https://github.com/ThinkingSpade/FlyRocketSeo/blob/main/docs/DEPLOY_INTERNET_FACING.md";

type AuthConfigErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

export function AuthConfigErrorCard({
  message,
  onRetry,
}: AuthConfigErrorCardProps) {
  return (
    <div className="relative flex flex-col rounded-xl w-full max-w-2xl bg-base-100 border border-base-300 shadow-xl">
      <div className="flex flex-auto flex-col gap-4 p-6 text-sm">
        <h2 className="text-base font-semibold gap-2">
          <ShieldAlert className="size-5 text-error" />
          Authentication setup required
        </h2>

        <Banner variant="error">
          <span>{message}</span>
        </Banner>

        <p className="text-sm text-base-content/70">
          Check the auth environment variables for your selected
          <code className="mx-1">AUTH_MODE</code>. Cloudflare Access requires
          <code className="mx-1">TEAM_DOMAIN</code> and
          <code className="mx-1">POLICY_AUD</code>. Hosted mode requires
          <code className="mx-1">BETTER_AUTH_SECRET</code> and
          <code className="ml-1">BETTER_AUTH_URL</code>.
        </p>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {onRetry ? (
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try Again
            </Button>
          ) : null}
          {/* An anchor, so LinkButton rather than Button — it keeps the real
              <a> (middle-click, copy link) while matching the button beside it. */}
          <LinkButton
            variant="primary"
            size="sm"
            href={README_CLOUDFLARE_ACCESS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Setup Guide
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
