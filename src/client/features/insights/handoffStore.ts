import { useSyncExternalStore } from "react";

/**
 * Carries the thing you just analyzed into the next tab you open, so moving
 * from a SERP lookup to a content brief does not mean retyping the keyword.
 *
 * sessionStorage rather than a query cache: it must survive a full navigation
 * but must not outlive the browsing session. Structured exactly like
 * `useSearchTabs`, including treating unreadable storage as empty.
 *
 * Writing an entry never causes a fetch. Reading tabs use it only as one level
 * of the prefill precedence chain.
 */

export type HandoffKind = "keyword" | "domain" | "url";

export type HandoffEntry = {
  kind: HandoffKind;
  value: string;
  /** The market the source tab ran in, when it had one. */
  locationCode?: number;
  /** Which tab wrote it, for the "carried from SERP Overview" hint. */
  source: string;
  at: number;
};

/** Long enough to cross a few tabs, short enough that yesterday's keyword
 *  never reappears as though it were a considered default. */
export const HANDOFF_TTL_MS = 30 * 60 * 1000;

const CHANGE_EVENT = "insights-handoff-change";

function storageKey(projectId: string): string {
  return `insights-handoff:${projectId}`;
}

function isKind(value: unknown): value is HandoffKind {
  return value === "keyword" || value === "domain" || value === "url";
}

function parseEntry(raw: unknown): HandoffEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isKind(record.kind)) return null;
  if (typeof record.value !== "string" || record.value === "") return null;
  if (typeof record.source !== "string" || record.source === "") return null;
  if (typeof record.at !== "number") return null;
  return {
    kind: record.kind,
    value: record.value,
    locationCode:
      typeof record.locationCode === "number" ? record.locationCode : undefined,
    source: record.source,
    at: record.at,
  };
}

export function readHandoff(
  projectId: string,
  now: number = Date.now(),
): HandoffEntry | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(storageKey(projectId));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const entry = parseEntry(parsed);
  if (!entry) return null;
  if (now - entry.at > HANDOFF_TTL_MS) return null;
  return entry;
}

export function writeHandoff(projectId: string, entry: HandoffEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(projectId), JSON.stringify(entry));
  } catch {
    // A full or disabled sessionStorage costs us a convenience, nothing more.
    return;
  }
  snapshotCache.delete(projectId);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * `useSyncExternalStore` compares snapshots by identity on every render, so
 * returning a freshly parsed object each call throws "The result of
 * getSnapshot should be cached to avoid an infinite loop". Cache per project
 * and invalidate on write, exactly as `useSearchTabs` does with `stateCache`.
 */
const snapshotCache = new Map<string, HandoffEntry | null>();

function getSnapshot(projectId: string): HandoffEntry | null {
  if (snapshotCache.has(projectId)) {
    const cached = snapshotCache.get(projectId) ?? null;
    // An entry that has since aged out must stop being served, even though no
    // write happened to invalidate it.
    if (cached && Date.now() - cached.at > HANDOFF_TTL_MS) {
      snapshotCache.set(projectId, null);
      return null;
    }
    return cached;
  }
  const fresh = readHandoff(projectId);
  snapshotCache.set(projectId, fresh);
  return fresh;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Reactive read for components. */
export function useHandoff(projectId: string): HandoffEntry | null {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(projectId),
    () => null,
  );
}
