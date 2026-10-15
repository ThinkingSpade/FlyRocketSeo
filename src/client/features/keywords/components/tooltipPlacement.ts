/** Clamp the measured tooltip, not just its anchor, to the viewport. */
export function placeTooltip(
  anchor: { top: number; bottom: number; center: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const gap = 8;
  const above = anchor.top - size.height - gap;
  return {
    left: Math.max(
      gap,
      Math.min(
        anchor.center - size.width / 2,
        viewport.width - size.width - gap,
      ),
    ),
    top: Math.max(
      gap,
      Math.min(
        above >= gap ? above : anchor.bottom + gap,
        viewport.height - size.height - gap,
      ),
    ),
  };
}
