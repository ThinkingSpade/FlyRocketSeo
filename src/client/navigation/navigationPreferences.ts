const STORAGE_KEY = "flyrocketseo:nav-collapsed:v1";

/** This preference contains only navigation labels, never website/account data. */
export function readCollapsedGroups(
  storage: Pick<Storage, "getItem">,
  labels: readonly string[],
): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (label): label is string =>
            typeof label === "string" && labels.includes(label),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

export function writeCollapsedGroups(
  storage: Pick<Storage, "setItem">,
  labels: readonly string[],
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(labels));
  } catch {
    /* Layout choices remain usable when storage is unavailable. */
  }
}
