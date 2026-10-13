import { useEffect, useState } from "react";
import { isSupportedLocationCode } from "@/client/features/keywords/locations";
import {
  readProjectKeywordLocation,
  writeProjectKeywordLocation,
} from "./preferredKeywordLocationStore";

/**
 * A saved preference always outranks the fallback -- it is an explicit user
 * choice, so it must win even over a project's own configured market. Pulled
 * out as its own function (rather than inlined behind `??`) so the precedence
 * this hook exists to encode has a name and can be unit-tested without
 * mounting a component.
 */
export function resolvePreferredLocationCode(
  savedLocationCode: number | null,
  fallbackLocationCode: number,
): number {
  return savedLocationCode ?? fallbackLocationCode;
}

/**
 * `fallbackLocationCode` is whatever the caller wants to use when there is no
 * saved preference -- the project's configured market, or the US constant
 * when even that isn't resolved yet. It is read fresh on every render rather
 * than captured once: callers typically source it from an async query
 * (`["projects"]`), and a value that only arrives after first paint must still
 * take effect the moment it lands, right up until the user runs a search.
 * Once a preference is saved, `savedLocationCode` is non-null and the
 * fallback -- however it changes after that -- no longer matters.
 */
export function usePreferredKeywordLocation(
  projectId: string,
  fallbackLocationCode: number,
) {
  // Starts `null` on both server and first client render -- localStorage is
  // unreachable during SSR, and reading it eagerly via a lazy `useState`
  // initializer would make the client's first render (which hydration
  // compares against the server's markup) disagree with what the server
  // produced. The effect below corrects it after mount, client-only, exactly
  // once: from then on this is derived during render (see
  // `resolvePreferredLocationCode`), not written by an effect.
  const [savedLocationCode, setSavedLocationCodeState] = useState<
    number | null
  >(null);

  useEffect(() => {
    setSavedLocationCodeState(readProjectKeywordLocation(projectId));
  }, [projectId]);

  const preferredLocationCode = resolvePreferredLocationCode(
    savedLocationCode,
    fallbackLocationCode,
  );

  function setPreferredLocationCode(locationCode: number) {
    if (!isSupportedLocationCode(locationCode)) return;
    setSavedLocationCodeState(locationCode);
    writeProjectKeywordLocation(projectId, locationCode);
  }

  return { preferredLocationCode, setPreferredLocationCode };
}
