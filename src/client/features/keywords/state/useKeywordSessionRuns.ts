import { useCallback, useMemo, useRef, useState } from "react";
import type { KeywordControlsValues } from "@/client/features/keywords/hooks/useKeywordControlsForm";
import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import {
  parseStoredGeo,
  resolveRunGeo,
  toStoredMetricGeo,
} from "@/client/features/geo/resolveRunGeo";
import type { ResolvedGeo, TargetArea } from "@/shared/geo/types";
import { keywordResearchGeoBundleSchema } from "@/types/schemas/keywords";
import { STORED_GEO_BUNDLE_VERSION } from "@/types/schemas/geo";
import {
  findSessionRun,
  recordSessionRun,
  type KeywordSessionRun,
} from "./keywordSessionRuns";

/** The geo captured for a session run when it was authorized --
 *  volume can go genuinely local (Google Ads); difficulty stays Labs-only
 *  national regardless (see resolveGeo.ts's NATIONAL_ONLY set). Bundled so
 *  the results view can label each column from ONE captured object, never
 *  by re-deriving from the live scope control. `parentCountryCode` (Defect
 *  1 fix) is the single session location this WHOLE bundle was captured
 *  against -- see `toStoredMetricGeo`'s own doc comment for why one value
 *  covers every metric here -- carried so the bundle can be persisted for
 *  a later restore. */
type KeywordResearchGeo = {
  volume: ResolvedGeo;
  difficulty: ResolvedGeo;
  parentCountryCode: number;
};

/** The wire payload sent alongside a live request purely so the server can
 *  persist it -- nothing here reads its own return value back for anything
 *  (see `parseRestoredKeywordResearchGeo` below for the restore side). */
function buildKeywordResearchGeoPayload(geo: KeywordResearchGeo) {
  return {
    v: STORED_GEO_BUNDLE_VERSION,
    volume: toStoredMetricGeo(geo.volume, geo.parentCountryCode),
    difficulty: toStoredMetricGeo(geo.difficulty, geo.parentCountryCode),
  } as const;
}

/**
 * For a restored/auto-restored search that never went through this
 * session's own authorize() call -- reads the geo bundle THAT SEARCH
 * persisted (Defect 1 fix), never the live scope control, and never
 * reconstructed from the bare stored `locationCode` (which, for a local
 * search, is itself a metro code -- indistinguishable from an unrecognised
 * country without the bundle). A search recorded before this bundle
 * existed (or a corrupt one) returns null -- "geography unknown for this
 * run" -- which every render already treats the same as no geo at all.
 */
export function parseRestoredKeywordResearchGeo(
  params: unknown,
): KeywordResearchGeo | null {
  const bundle = parseStoredGeo(keywordResearchGeoBundleSchema, params);
  if (!bundle) return null;
  return {
    volume: bundle.volume,
    difficulty: bundle.difficulty,
    parentCountryCode: bundle.volume.parentCountryCode,
  };
}

/**
 * Every keyword search run in this mounted session, and which one answers
 * the search the URL (the active tab) names -- see keywordSessionRuns.ts.
 * Each run keeps the geo captured in the SAME submit that authorized it
 * (never recomputed later from the live scope control -- see
 * resolveRunGeo.ts's own header) and the nonce its query is cached under.
 */
export function useKeywordSessionRuns(input: {
  projectId: string;
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  targetArea: TargetArea;
}) {
  const [sessionRuns, setSessionRuns] = useState<
    KeywordSessionRun<KeywordResearchGeo>[]
  >([]);
  const lastRunNonceRef = useRef(0);
  // Set by "Recent searches": the user asked for the list, so a stored past
  // run must not be auto-restored over it.
  const [autoRestoreDismissed, setAutoRestoreDismissed] = useState(false);
  const dismissAutoRestore = useCallback(
    () => setAutoRestoreDismissed(true),
    [],
  );

  const { keywordInput, locationCode, resultLimit, mode, clickstream } = input;
  const matchedRun = useMemo(
    () =>
      findSessionRun(
        sessionRuns,
        keywordInput.trim()
          ? {
              keyword: keywordInput,
              locationCode,
              resultLimit,
              mode,
              clickstream,
            }
          : null,
      ),
    [sessionRuns, keywordInput, locationCode, resultLimit, mode, clickstream],
  );

  const latestRunNonce = sessionRuns.at(-1)?.nonce ?? null;
  const { projectId } = input;
  const sessionRun = useMemo(
    () =>
      matchedRun
        ? {
            input: {
              projectId,
              keywordInput: matchedRun.values.keyword,
              // The CAPTURED geo's own locationCode -- a metro when the
              // confirmed target area applied, else what the form submitted.
              // Never re-derived here from live scope.
              locationCode: matchedRun.geo.volume.locationCode,
              resultLimit: matchedRun.values.resultLimit,
              mode: matchedRun.values.mode,
              clickstream: matchedRun.values.clickstream,
            },
            nonce: matchedRun.nonce,
            // Only the search just submitted may fetch; see the data hook.
            live: matchedRun.nonce === latestRunNonce,
            capture: {
              languageCode: matchedRun.geo.volume.languageCode,
              // Defect 1 fix: sent purely so the server can persist it in
              // this run's history -- never read back to decide anything
              // about the request itself.
              geo: buildKeywordResearchGeoPayload(matchedRun.geo),
            },
          }
        : null,
    [matchedRun, latestRunNonce, projectId],
  );

  const { targetArea } = input;
  const recordRun = useCallback(
    (value: KeywordControlsValues) => {
      lastRunNonceRef.current += 1;
      const run: KeywordSessionRun<KeywordResearchGeo> = {
        values: value,
        // Captured HERE, at the exact moment this run is authorized -- the
        // form's own submitted locationCode is this run's session location,
        // matched against the CURRENT target area. A later scope change can
        // never retroactively relabel what already fetched.
        geo: {
          volume: resolveRunGeo(
            "keyword-volume",
            targetArea,
            value.locationCode,
          ),
          difficulty: resolveRunGeo(
            "keyword-difficulty",
            targetArea,
            value.locationCode,
          ),
          parentCountryCode: value.locationCode,
        },
        nonce: lastRunNonceRef.current,
      };
      setSessionRuns((runs) => recordSessionRun(runs, run));
    },
    [targetArea],
  );

  return {
    matchedRun,
    sessionRun,
    recordRun,
    // Automatic restore only before this session has searched, and not once
    // the user has asked for Recent searches.
    autoRestoreAllowed: sessionRuns.length === 0 && !autoRestoreDismissed,
    dismissAutoRestore,
  };
}
