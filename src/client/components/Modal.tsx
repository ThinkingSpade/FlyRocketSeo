import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  useEffect(() => {
    if (!onClose) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative flex flex-col rounded-xl bg-base-100 border border-base-300 w-full ${maxWidth} shadow-xl`}
      >
        <div className="flex flex-auto flex-col gap-4 p-6 text-sm">
          {children}
        </div>
      </div>
    </div>
  );

  // Portalled to <body> rather than rendered in place, because a dialog has to
  // be measured against the VIEWPORT -- and `position: fixed` only means that
  // while no ancestor creates a containing block for it. Any `transform`,
  // `filter`, `perspective`, `contain` or `will-change: transform` ANYWHERE
  // above this element silently re-anchors the overlay to that ancestor's box,
  // and nothing about the markup here hints that it happened.
  //
  // Not hypothetical, and not once: the page-entrance reveal has left an
  // identity transform above page content twice now, under two different
  // implementations -- first the <Reveal> wrapper, then the CSS-only
  // `[data-reveal-stagger]` that replaced it. Both rendered this overlay at the
  // content column's size instead of the viewport's and pushed its dialog off
  // the top of the screen, at every call site at once. Fixing the CSS restores
  // it, but the invariant that fix relies on -- "nothing above page content may
  // ever have a transform" -- is invisible, unenforceable, and has now been
  // broken by two separate ordinary animation commits.
  //
  // Escaping to <body> makes the whole class of failure impossible, and also
  // covers the window where the reveal's transform is legitimately live
  // mid-animation and a modal opened over it would still mis-anchor.
  //
  // Guarded because createPortal needs a real document: the server renders
  // nothing and the client fills it in, the same shape IntentBadge.tsx uses for
  // its tooltip portal. Modals are only ever opened by interaction, so no modal
  // is open during SSR for the two to disagree about.
  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : null;
}
