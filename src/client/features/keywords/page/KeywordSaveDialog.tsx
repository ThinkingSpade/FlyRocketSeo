import { Button } from "@cloudflare/kumo/components/button";
import type { KeywordResearchControllerState } from "./types";

/** Lifted out of KeywordResearchPage.tsx, which had grown past this repo's
 *  400-line ceiling. It is the most self-contained thing in that file — one
 *  boolean in, two callbacks out, no geo or query state — so it costs the
 *  page nothing to lose. */
export function KeywordSaveDialog({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  if (!controller.showSaveDialog) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">
          Save {controller.selectedRows.size} Keywords
        </h3>
        <div className="py-4">
          <p className="text-base-content/70 text-sm">
            These keywords will be saved to your current project.
          </p>
        </div>
        <div className="modal-action">
          <Button onClick={() => controller.setShowSaveDialog(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={controller.confirmSave}>
            Save
          </Button>
        </div>
      </div>
      <div
        className="modal-backdrop"
        onClick={() => controller.setShowSaveDialog(false)}
      />
    </div>
  );
}
