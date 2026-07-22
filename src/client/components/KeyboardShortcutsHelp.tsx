import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/client/components/Modal";
import { useSession } from "@/lib/auth-client";

// Module-level open channel, mirroring CommandPalette: the global keydown
// listener lives inside the overlay, but other surfaces (the command palette)
// need to open it without a shared store. They dispatch this window event; the
// mounted overlay listens.
const OPEN_EVENT = "flyrocketseo:open-keyboard-shortcuts";

/** Open the keyboard-shortcuts help from anywhere (e.g. the command palette). */
export function openKeyboardShortcuts() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** True when focus is in a field where "?" is a literal character, not a
 * shortcut. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function KeyboardShortcutsHelp() {
  const { data: session } = useSession();
  // Don't mount the listener or overlay on signed-out pages.
  if (!session?.user) return null;
  return <KeyboardShortcutsHelpImpl />;
}

function KeyboardShortcutsHelpImpl() {
  const [open, setOpen] = useState(false);

  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /mac|iphone|ipad|ipod/i.test(navigator.userAgent),
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Global keyboard: "?" (Shift+/) toggles the help — but never while typing in
  // a field, and never when a command modifier is held (those key combos belong
  // to other shortcuts). Escape close is handled by Modal.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "?" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, []);

  const shortcuts = useMemo(
    () => [
      { keys: isMac ? "⌘K" : "Ctrl K", description: "Open command palette" },
      { keys: "?", description: "Show this help" },
      { keys: "Esc", description: "Close dialogs / menus" },
    ],
    [isMac],
  );

  if (!open) return null;

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={close}
      labelledBy="keyboard-shortcuts-title"
    >
      <h3 id="keyboard-shortcuts-title" className="text-lg font-semibold">
        Keyboard shortcuts
      </h3>
      <ul className="flex flex-col gap-2">
        {shortcuts.map((shortcut) => (
          <li
            key={shortcut.description}
            className="flex items-center justify-between gap-4"
          >
            <span className="text-sm text-base-content/70">
              {shortcut.description}
            </span>
            <kbd className="kbd kbd-sm">{shortcut.keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
