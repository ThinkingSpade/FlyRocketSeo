const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact "how long ago did this run" label for the restored-run banner.
 * `now` is injected so the formatting is deterministic under test. Returns null
 * for an unparseable timestamp so callers can omit the age entirely.
 */
export function formatRunAge(iso: string, now: number): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const elapsed = now - then;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;

  // Past a month a relative age stops being useful — show the date instead.
  return iso.slice(0, 10);
}
