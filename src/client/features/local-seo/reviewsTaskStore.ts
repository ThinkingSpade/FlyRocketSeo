import { z } from "zod";

/**
 * Remembers which reviews crawl is in flight, so navigating away does not
 * orphan a task the user already paid for.
 *
 * `startBusinessReviews` posts a billed DataForSEO task and returns an id;
 * `getBusinessReviewsResult` reads it back for free. Holding that id in React
 * state alone meant any unmount — a project switch, a click on another tab —
 * destroyed the only handle to a paid job. The user came back to an idle
 * "Fetch reviews" button and pressed it, buying the same crawl twice.
 *
 * Persisted rather than lifted into a parent because the fix has to survive an
 * unmount, and nothing above this component stays mounted across a project
 * switch (`<Outlet key={projectId} />` remounts the whole page subtree).
 *
 * Scoped by project AND keyword: one project can look up several businesses,
 * and a task belongs to the business it was posted for.
 */

const PREFIX = "local-reviews-task:";

/**
 * How long a stored id is worth reading back.
 *
 * DataForSEO keeps completed task results well past this, so the bound is about
 * relevance rather than availability: a crawl from last month says nothing
 * useful about today's reviews, and silently replaying it would look like a
 * fresh result.
 */
const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a task may sit `pending` before we stop calling it live.
 *
 * These crawls finish in well under a minute. Past this, something upstream
 * went wrong, and the important consequence is UI: without a cutoff a task that
 * never completes would leave the button disabled at "Crawling reviews…"
 * forever, with no way to start a new one.
 */
export const REVIEWS_STALL_AFTER_MS = 10 * 60 * 1000;

const storedTaskSchema = z.object({
  taskId: z.string().min(1),
  /** Epoch ms. Compared against `Date.now()`, never rendered. */
  startedAt: z.number().finite(),
});

export type StoredReviewsTask = z.infer<typeof storedTaskSchema>;

function keyFor(projectId: string, keyword: string): string {
  return `${PREFIX}${projectId}:${keyword.trim().toLowerCase()}`;
}

export function loadReviewsTask(
  projectId: string,
  keyword: string,
  now: number = Date.now(),
): StoredReviewsTask | null {
  try {
    const raw = localStorage.getItem(keyFor(projectId, keyword));
    if (!raw) return null;
    const result = storedTaskSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    const parsed = result.data;
    // A clock that moved backwards would otherwise make `startedAt` look like
    // the future and keep a dead task alive indefinitely.
    if (parsed.startedAt > now) return null;
    if (now - parsed.startedAt > REPLAY_WINDOW_MS) {
      clearReviewsTask(projectId, keyword);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveReviewsTask(
  projectId: string,
  keyword: string,
  task: StoredReviewsTask,
): void {
  try {
    localStorage.setItem(keyFor(projectId, keyword), JSON.stringify(task));
  } catch {
    // Storage full or unavailable. The in-memory id still works for this
    // mount, so the crawl is not lost — only its resumability is.
  }
}

export function clearReviewsTask(projectId: string, keyword: string): void {
  try {
    localStorage.removeItem(keyFor(projectId, keyword));
  } catch {
    // Nothing actionable; a stale entry expires on its own.
  }
}
