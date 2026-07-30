import type { ReactNode } from "react";

/**
 * The outer frame every project page sits in.
 *
 * Before this, 29 pages each wrote their own. The padding came in four
 * spellings of the same thing — `px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6
 * md:pb-8` and three reorderings of it — and the content width came in five
 * genuinely different values: `max-w-screen-2xl` (8 pages), `max-w-7xl` (6),
 * `max-w-5xl` (3), `max-w-4xl`, `max-w-2xl`.
 *
 * The width is the part users actually notice. Navigating between tabs moved the
 * left edge of the content, which reads as pages belonging to different
 * applications. There are now two widths, and the choice is about the content
 * rather than the page:
 *
 * - `data` (default) — anything with a table, a chart or a grid. Wide, because
 *   an SEO tool's rows are long and horizontal scroll is worse than density.
 * - `form` — settings, onboarding, single-column reading. Narrow, because a
 *   96-character line of prose or a full-width text input is harder to use, not
 *   easier.
 *
 * Deliberately no `className` prop. A per-page escape hatch is exactly how the
 * five widths happened; if a page needs something else, it belongs here as a
 * third named intent that everyone can see.
 */

const WIDTHS = {
  data: "max-w-screen-2xl",
  form: "max-w-2xl",
} as const;

export function AppPageShell({
  width = "data",
  children,
}: {
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    // `pb-24` on small screens clears the mobile bottom nav; the desktop
    // breakpoint drops back to normal padding.
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className={`mx-auto flex w-full flex-col gap-4 ${WIDTHS[width]}`}>
        {children}
      </div>
    </div>
  );
}
