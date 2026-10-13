import { ArrowDown, ArrowUp, ArrowsDownUp } from "@phosphor-icons/react";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import type { SortOrder } from "@/client/features/domain/types";

type Props = {
  label: string;
  helpText?: string;
  isActive: boolean;
  order: SortOrder;
  onClick: () => void;
};

export function SortableHeader({
  label,
  helpText,
  isActive,
  order,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-sm font-medium transition-colors duration-150 hover:text-base-content"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      aria-pressed={isActive}
    >
      {helpText ? (
        <HeaderHelpLabel label={label} helpText={helpText} />
      ) : (
        <span>{label}</span>
      )}
      {isActive ? (
        order === "asc" ? (
          <ArrowUp aria-hidden="true" className="size-3 shrink-0" />
        ) : (
          <ArrowDown aria-hidden="true" className="size-3 shrink-0" />
        )
      ) : (
        <ArrowsDownUp
          aria-hidden="true"
          className="size-3 shrink-0 opacity-40"
        />
      )}
    </button>
  );
}
