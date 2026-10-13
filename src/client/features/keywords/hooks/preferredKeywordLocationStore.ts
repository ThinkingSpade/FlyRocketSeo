import { isSupportedLocationCode } from "@/client/features/keywords/locations";
const key = (projectId: string) => `keyword-preferred-location:${projectId}`;

export function readProjectKeywordLocation(projectId: string): number | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === "number" && isSupportedLocationCode(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeProjectKeywordLocation(
  projectId: string,
  locationCode: number,
) {
  if (!isSupportedLocationCode(locationCode)) return;
  try {
    localStorage.setItem(key(projectId), JSON.stringify(locationCode));
  } catch {
    /* Best-effort local preference. */
  }
}
