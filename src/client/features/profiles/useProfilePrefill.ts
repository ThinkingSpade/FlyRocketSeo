import { useMemo } from "react";
import { useProject } from "@/client/hooks/useProjectDomain";
import { useTargetArea } from "@/client/features/geo/useTargetArea";
import type { ServiceAreaKind } from "@/shared/keyword-fit/profileTypes";
import {
  deriveBrandTerms,
  primaryAreaOf,
  serviceAreaKindForArea,
} from "./profilePrefill";

// Not exported: the only consumer passes this straight into `applyPrefill`,
// which names the shape in its own signature.
type ProfilePrefill = {
  serviceAreaKind: ServiceAreaKind | null;
  brandTerms: string;
};

/**
 * The free half of filling this card in.
 *
 * Both sources are already cached by the time this runs: `["projects"]` is
 * fetched by the app shell, and `["target-area", projectId]` by
 * `TargetAreaBanner`, which renders immediately above this card on the one
 * tab that hosts it. So this adds no request of its own and costs nothing --
 * which is the point, since it must run on mount, before the user has asked
 * for anything.
 *
 * Memoised on the primitive values rather than on the query objects: both
 * hooks return fresh identities every render, and the consumer feeds this
 * into an effect's dependency list.
 */
export function useProfilePrefill(projectId: string): ProfilePrefill {
  const project = useProject(projectId);
  const targetArea = useTargetArea(projectId);

  const projectName = project?.name ?? "";
  const domain = project?.domain ?? null;
  const areaKind = primaryAreaOf(targetArea.data)?.kind ?? null;

  return useMemo(
    () => ({
      serviceAreaKind: areaKind ? serviceAreaKindForArea(areaKind) : null,
      brandTerms: deriveBrandTerms({ projectName, domain }),
    }),
    [areaKind, projectName, domain],
  );
}
