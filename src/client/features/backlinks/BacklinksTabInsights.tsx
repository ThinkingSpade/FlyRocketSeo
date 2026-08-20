import { useMemo } from "react";
import { resolveBrandTerms } from "@/client/features/profiles/profileBrandTerms";
import { useProjectProfile } from "@/client/features/profiles/useProjectProfile";
import {
  AnchorHealthCard,
  DomainQualityCard,
  ToxicLinksCard,
} from "./BacklinksProfileInsights";
import { BrokenLinkReclaimCard } from "./BacklinksProfileSections";
import type {
  BacklinksAnchorsData,
  BacklinksReferringDomainsData,
  BacklinksSearchState,
  BacklinksTopPagesData,
} from "./backlinksPageTypes";

/**
 * The insight cards that read a results sub-tab's rows, rendered directly above
 * the table that supplies them.
 *
 * They used to sit near the top of the page, which meant a default load showed
 * a mostly-empty grid, and opening a lower sub-tab made cards appear several
 * screens above the table the user was looking at. Nothing here fetches: each
 * card reads the rows the active tab already loaded and renders nothing until
 * they exist, so this never opens a tab or spends on the user's behalf.
 *
 * The caption is deliberate. These describe the page of rows currently loaded,
 * not the whole profile, and a card that silently implies otherwise is telling
 * the user something false about their own link profile.
 */
export function BacklinksTabInsights({
  activeTab,
  projectId,
  target,
  referringDomains,
  anchors,
  topPages,
}: {
  activeTab: BacklinksSearchState["tab"];
  projectId: string;
  target: string;
  referringDomains: BacklinksReferringDomainsData | undefined;
  anchors: BacklinksAnchorsData | undefined;
  topPages: BacklinksTopPagesData | undefined;
}) {
  const { profile } = useProjectProfile(projectId);
  // Anchors that match no brand token fall through to "descriptive", which is
  // what the "Over-optimized" verdict counts -- so a client whose brand is not
  // their domain had their own brand anchors read as commercial anchor
  // stuffing. The curated names are exactly the spellings a domain cannot
  // tell you.
  const brandTerms = useMemo(
    () => resolveBrandTerms(profile, target),
    [profile, target],
  );

  if (activeTab === "domains") {
    return (
      <InsightGroup rowCount={referringDomains?.rows.length}>
        <DomainQualityCard referringDomains={referringDomains} />
        <ToxicLinksCard referringDomains={referringDomains} target={target} />
      </InsightGroup>
    );
  }

  if (activeTab === "anchors") {
    return (
      <InsightGroup rowCount={anchors?.rows.length}>
        <AnchorHealthCard
          anchors={anchors}
          target={target}
          brandTerms={brandTerms}
        />
      </InsightGroup>
    );
  }

  if (activeTab === "pages") {
    return (
      <InsightGroup rowCount={topPages?.rows.length}>
        <BrokenLinkReclaimCard topPages={topPages} />
      </InsightGroup>
    );
  }

  return null;
}

function InsightGroup({
  rowCount,
  children,
}: {
  rowCount: number | undefined;
  children: React.ReactNode;
}) {
  // Before the tab has loaded there is nothing to describe, and an empty
  // captioned shell would read as a card that failed rather than one that has
  // not been asked for yet.
  if (!rowCount) return null;

  return (
    <div className="space-y-2 border-b border-base-300 px-4 py-4">
      <p className="text-xs text-base-content/55">
        Based on {rowCount.toLocaleString()} {rowCount === 1 ? "row" : "rows"}{" "}
        on this page.
      </p>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}
