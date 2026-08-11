import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
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
  // Controlled rather than trigger-driven: the dialog is opened from the bulk
  // action bar elsewhere in the tree, so `open` is the controller's state.
  // Kumo supplies the backdrop, the focus trap and Escape-to-close, all of
  // which the hand-rolled version was missing -- the old `modal-backdrop` div
  // only closed on click.
  return (
    <Dialog.Root
      open={controller.showSaveDialog}
      onOpenChange={(open) => controller.setShowSaveDialog(open)}
    >
      <Dialog className="p-6">
        <Dialog.Title className="text-lg font-bold">
          Save {controller.selectedRows.size} Keywords
        </Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-base-content/70">
          These keywords will be saved to your current project.
        </Dialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close render={(props) => <Button {...props}>Cancel</Button>} />
          <Button variant="primary" onClick={controller.confirmSave}>
            Save
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
