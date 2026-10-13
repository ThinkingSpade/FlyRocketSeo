import { Link } from "@tanstack/react-router";
import { Warning } from "@phosphor-icons/react";
import { Sidebar } from "@/client/components/Sidebar";
import { dataforseoHelpLinkOptions } from "@/client/navigation/items";
import { Banner } from "@cloudflare/kumo/components/banner";

function SeoApiStatusBanners({
  shouldShowSeoApiWarning,
  seoApiKeyStatusError,
}: {
  shouldShowSeoApiWarning: boolean;
  seoApiKeyStatusError: boolean;
}) {
  return (
    <>
      {shouldShowSeoApiWarning ? (
        <div className="shrink-0 px-4 py-2.5 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Banner variant="default">
              <Warning className="size-4 shrink-0" />
              <span className="text-sm">
                Provider research is optional. Search Console and stored site
                evidence remain available. Add a DataForSEO API key when you
                need provider research; see the{" "}
                <Link
                  {...dataforseoHelpLinkOptions}
                  className="app-link font-medium"
                >
                  help page
                </Link>
                .
              </span>
            </Banner>
          </div>
        </div>
      ) : null}

      {seoApiKeyStatusError ? (
        <div className="shrink-0 px-4 py-2.5 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Banner variant="default">
              <Warning className="size-4 shrink-0" />
              <span className="text-sm">
                We could not verify your DataForSEO setup. If features are not
                working, check the setup steps on the{" "}
                <Link
                  {...dataforseoHelpLinkOptions}
                  className="app-link font-medium"
                >
                  help page
                </Link>
                .
              </span>
            </Banner>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MobileSidebarDrawer({
  open,
  projectId,
  onClose,
}: {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close sidebar"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="absolute left-0 top-0 h-full shadow-xl">
        <Sidebar projectId={projectId} onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}

export { MobileSidebarDrawer, SeoApiStatusBanners };
