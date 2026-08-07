import { useEffect } from "react";
import { getSignInHref, getSignInHrefForLocation } from "@/lib/auth-redirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { Button } from "@cloudflare/kumo/components/button";

type UnauthenticatedErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

export function UnauthenticatedErrorCard({
  message,
  onRetry,
}: UnauthenticatedErrorCardProps) {
  const isHostedMode = isHostedClientAuthMode();
  const signInHref =
    typeof window === "undefined"
      ? getSignInHref("/")
      : getSignInHrefForLocation(window.location);

  useEffect(() => {
    if (typeof window === "undefined" || !isHostedMode) {
      return;
    }

    window.location.replace(signInHref);
  }, [isHostedMode, signInHref]);

  if (isHostedMode) {
    return null;
  }

  return (
    <div className="relative flex flex-col rounded-xl w-full max-w-md bg-base-100 border border-base-300 shadow-xl">
      <div className="flex flex-auto flex-col gap-4 p-6 text-sm">
        <h2 className="text-base font-semibold">Authentication required</h2>
        <p className="text-sm text-base-content/70">{message}</p>
        <p className="text-sm text-base-content/70">
          This deployment uses external authentication. Refresh your access
          session, then try again.
        </p>
        {onRetry ? (
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button variant="primary" size="sm" onClick={onRetry}>
              Try Again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
