import { KeywordResearchDesktopResults } from "./KeywordResearchDesktopResults";
import { KeywordResearchMobileResults } from "./KeywordResearchMobileResults";
import { PpcValuePanel } from "./PpcValuePanel";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchResults({ controller }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full gap-3">
      <KeywordResearchDesktopResults controller={controller} />
      <KeywordResearchMobileResults controller={controller} />
      {/* Derived from the volume/CPC/difficulty already on these rows — no
          extra call, so it costs nothing to show. */}
      <PpcValuePanel rows={controller.rows} />
    </div>
  );
}
