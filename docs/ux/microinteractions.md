# Microinteractions and behavior

## Navigation and dialogs

The command menu supports its search field, matching options, arrow-key selection, Enter navigation and Escape closure. Escape returns focus to the trigger. Project parameters remain attached to destinations. The mobile navigation drawer is modal, contains forward and reverse Tab navigation and restores its trigger on Escape. Group preferences survive reopening through the existing preference store.

The shared dialog uses the installed accessible dialog primitive rather than a custom collection of click handlers. Preserve its close behavior, bounded scrolling and focus lifecycle when adding forms. Unsaved-change protection for every form is not implemented by this change.

## Tables and paid research

Sortable headers are real keyboard-operable buttons; sorted columns expose `aria-sort`. Explanations distinguish search volume from visits and research estimates from measured Search Console traffic. Tooltip placement is clamped to the viewport and responds to focus, hover, Escape and repositioning.

Domain table controls distinguish an unrequested query, loading, an empty result, an error and loaded rows. An unrequested query is not reported as zero findings. Changing sort/query state can require fresh authorization before a metered lookup; the application does not silently reuse the old consent for a different request. Exports are unavailable when the corresponding rows have not loaded.

Pagination reports the records actually returned: seven rows on page two of a 50-row request read `51–57`, not `51–100`. An unknown total stays unknown. Empty and out-of-range pages do not display invented intervals.

## Selection, export and recovery

The selection bar announces the selected count, wraps on narrow screens, respects the safe area and offers a named clear action. Its export menu opens upward and is explicitly layered above the toolbar. The final review reproduced a covered CSV item at 320px and 390px with a coarse pointer: the item passed visibility checks but could not receive a tap. Elevating the portaled positioner fixed both cases without a forced-click test.

The dedicated `bulk-actions-browser.mjs` suite mounts the real components with the real stylesheet. It requires mouse clicks or touch taps on both export items, one callback per action, menu dismissal and Escape focus restoration. The four viewport/input configurations passed after the repair. This component fixture does not call Google Sheets or write a real export file.

The full-application suite separately checks a real fixture CSV download, its filename and contents. The unsupported Excel label was removed. Clipboard denial produces an actionable message and leaves table controls usable; it does not display a false success state.

## Loading, errors and motion

Use local loading feedback, disabled actions while busy and retry controls for recoverable failures. Do not replace disconnected data with plausible sample numbers. Optional research-provider setup is an inline notice, not a modal blocking first-party Search Console or audit workflows.

Shared motion is short and honors reduced-motion preferences. The captured reduced-motion check confirms immediate content visibility; it is not a motion audit of every chart, third-party widget or browser.
