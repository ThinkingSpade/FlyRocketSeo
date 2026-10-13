import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";

/** Portalled, focus-contained dialog. Forms deliberately do not dismiss on a
 * backdrop press: that must not silently discard input. Escape and the
 * existing cancel actions close it; a missing onClose locks dismissal while
 * an in-flight save finishes. */
export function Modal({
  maxWidth = "max-w-sm",
  children,
  onClose,
  labelledBy,
}: {
  maxWidth?: string;
  children: ReactNode;
  onClose?: () => void;
  labelledBy?: string;
}) {
  return (
    <Dialog.Root
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="app-dialog-backdrop" />
        <Dialog.Popup
          aria-labelledby={labelledBy}
          className={`app-dialog-panel ${maxWidth}`}
        >
          <div className="flex min-h-0 flex-auto flex-col gap-4 p-5 text-sm sm:p-6">
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
