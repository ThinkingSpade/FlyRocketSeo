import { useRef, type RefObject } from "react";
import { openCommandPalette } from "@/client/components/CommandPalette";
import { Link } from "@tanstack/react-router";
import { Dialog } from "@base-ui/react/dialog";
import { Info, WarningCircle } from "@phosphor-icons/react";
import { Sidebar } from "@/client/components/Sidebar";
import { dataforseoHelpLinkOptions } from "@/client/navigation/items";

export function SeoApiStatusBanners({
  shouldShowSeoApiWarning,
  seoApiKeyStatusError,
}: {
  shouldShowSeoApiWarning: boolean;
  seoApiKeyStatusError: boolean;
}) {
  if (!shouldShowSeoApiWarning && !seoApiKeyStatusError) return null;
  const Icon = seoApiKeyStatusError ? WarningCircle : Info;
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-base-300 bg-base-200/40 px-4 py-2 text-xs text-base-content/70 md:px-6">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <p className="min-w-0">
        {seoApiKeyStatusError
          ? "We could not verify your DataForSEO setup. Search Console and stored site evidence still work. "
          : "Provider research is optional. Search Console and stored site evidence remain available. "}
        <Link {...dataforseoHelpLinkOptions} className="app-link font-medium">
          {seoApiKeyStatusError
            ? "Check provider setup"
            : "Add a DataForSEO key"}
        </Link>
      </p>
    </div>
  );
}

export function MobileSidebarDrawer({
  open,
  projectId,
  onClose,
  finalFocus,
  onCloseComplete,
}: {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  onCloseComplete?: () => void;
}) {
  const commandRequested = useRef(false);
  return (
    <Dialog.Root
      onOpenChangeComplete={(next) => {
        if (!next) onCloseComplete?.();
        if (!next && commandRequested.current) {
          commandRequested.current = false;
          requestAnimationFrame(openCommandPalette);
        }
      }}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="app-dialog-backdrop" />
        <Dialog.Popup
          id="mobile-navigation"
          aria-label="Navigation"
          finalFocus={finalFocus}
          className="app-navigation-drawer"
        >
          <Sidebar
            projectId={projectId}
            onNavigate={onClose}
            onClose={onClose}
            onOpenCommand={() => {
              commandRequested.current = true;
              onClose();
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
