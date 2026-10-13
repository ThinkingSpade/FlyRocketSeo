import { ArrowElbowDownLeft } from "@phosphor-icons/react";
import { Kbd } from "./Kbd";

export function CommandPaletteFooter() {
  return (
    <div className="flex items-center gap-3 border-t border-base-300 px-3 py-2 text-xs text-base-content/50">
      <span className="flex items-center gap-1">
        <Kbd size="xs">↑</Kbd>
        <Kbd size="xs">↓</Kbd>
        to navigate
      </span>
      <span className="flex items-center gap-1">
        <Kbd size="xs">
          <ArrowElbowDownLeft className="h-3 w-3" />
        </Kbd>
        to select
      </span>
      <span className="flex items-center gap-1">
        <Kbd size="xs">Esc</Kbd>
        to close
      </span>
    </div>
  );
}
