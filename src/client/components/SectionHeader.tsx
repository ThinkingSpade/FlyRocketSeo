import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { InsightIcon } from "@/client/components/InsightTile";

/**
 * The heading row inside a card.
 *
 * The exact class string `flex items-center gap-1.5 text-sm font-semibold`
 * appeared 31 times across 24 files. This is that, once.
 *
 * `headingLevel` is REQUIRED rather than defaulted, because the real hierarchy
 * contains both page-level card sections and nested sections inside them. That
 * is document structure a screen reader depends on, not a visual choice, so the
 * caller has to state it rather than inherit a guess.
 *
 * There is no `tone` prop. Existing headings use primary/info/warning icon
 * tints inconsistently for the same kind of section, which is drift rather than
 * meaning — they all migrate to the neutral treatment. Colour that carries no
 * information is noise, and it was also the thing most likely to look wrong in
 * one of the two themes.
 */
export function SectionHeader({
  headingLevel,
  title,
  icon,
  description,
  actions,
}: {
  headingLevel: 2 | 3;
  title: ReactNode;
  icon?: LucideIcon;
  /** Sub-caption under the heading — the "what this is and what it costs" line
   *  several sections already carry. */
  description?: ReactNode;
  /** Right-aligned controls on the heading row: a link, a toggle, an input. */
  actions?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="flex items-center gap-1.5 text-sm font-semibold">
          {icon ? <InsightIcon icon={icon} /> : null}
          {title}
        </Heading>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {description ? (
        <p className="text-xs text-base-content/50">{description}</p>
      ) : null}
    </div>
  );
}
