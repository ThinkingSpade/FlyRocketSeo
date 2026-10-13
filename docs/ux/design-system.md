# FlyRocketSEO interaction and layout system

This increment preserves the existing Kumo components, brand palette and Tailwind infrastructure. It is not a replacement design framework. Source: `src/client/styles/app.css`, `quality.css`, shared components, and the browser evidence described in `verification.md`.

## Surfaces and hierarchy

Use `AppPageShell` for project pages. Data screens use the available width; forms use `max-w-2xl`. Both retain consistent gutters, a readable heading and `min-w-0` containment. Use a single main landmark, a keyboard-visible skip link and meaningful page headings. Do not hide document overflow to conceal a broken layout: wide tables have their own scroll regions.

Overview leads with Search Console performance, then evidence-backed next actions, onboarding, audit and tracking. Research launchers remain available below these, rather than being the primary dashboard content. Root entry opens the selected project's Overview, not Keyword Research. Project selection must be verified before remembering it.

## Tokens and conventions

<!-- prettier-ignore -->
| Concern | Existing or implemented convention |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Surface and text | Existing `base-100/200/300`, `base-content`, and semantic Kumo aliases; do not invent a second palette |
| Focus | `--focus-width: 2px`, visible outline with 3px offset |
| Interaction timing | `--interaction-duration: 160ms`; easing `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Reduced motion | Interaction duration becomes zero; shared shell/dialog spinners stop rotating |
| Coarse-pointer controls | Opt-in `.app-touch-target` and navigation controls have a 44px minimum target |
| Small-screen inputs | At widths below 768px with a coarse pointer, text inputs use 16px type |
| Floating selection bar | Safe-area-aware bottom inset; wraps instead of exceeding the viewport; layer 30 |
| Bulk export menu | Portaled positioner at layer 40, above the selection bar and below modal dialogs |
| Dialogs | Backdrop at layer 50; panel/drawer at 51; bounded by the dynamic viewport |

Kumo's dropdown `className` styles the popup child, while `style` reaches its positioned portal ancestor. Elevation therefore belongs on the positioner. Applying only a popup z-index does not necessarily escape its ancestor's stacking context.

## Reusable building blocks

Use `Modal` for ordinary dialogs, `InlineQueryError` for recoverable requests, the shared table/pagination controls for table behavior, and the existing command menu for keyboard navigation. `FloatingTooltip` supports keyboard focus, Escape dismissal and viewport-aware positioning. Unknown totals use `domainPaginationRange`; never assume a full page was returned.

The desktop sidebar and mobile drawer share destinations and saved group preferences. Advanced destinations remain reachable; this increment does not pretend that all overlapping tools have already been consolidated.

## Content and accessibility rules

Show missing evidence as missing, not zero. Distinguish measured Search Console data, research-provider estimates and hypothetical click scenarios. Label actual CSV exports correctly. Explain when loading or changing a research query may require a paid request; do not charge merely because a user opens a tab.

Focus containment and restoration, keyboard tooltips and responsive screenshots have controlled browser evidence. No complete screen-reader, contrast, zoom or WCAG conformance audit has been performed. The 44px rule is opt-in, not a claim that every control has been audited.
