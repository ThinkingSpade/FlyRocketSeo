import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { Check, ArrowSquareOut, X } from "@phosphor-icons/react";
import { Modal } from "@/client/components/Modal";
import {
  closeExportToSheetsModal,
  openGoogleSheetsTab,
  useExportToSheetsModalState,
} from "@/client/lib/exportToSheets";
import { Button } from "@cloudflare/kumo/components/button";

export function ExportToSheetsModal() {
  const state = useExportToSheetsModalState();
  // Close any stale modal when the user navigates away mid-flow. Deps must
  // be `[pathname]` only — adding `isOpen` would close the modal the instant
  // it opens (the effect would fire on the open->true transition).
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    closeExportToSheetsModal();
  }, [pathname]);

  if (!state.isOpen) return null;

  const { rowCount } = state;

  const handleOpenSheet = () => {
    openGoogleSheetsTab();
    closeExportToSheetsModal();
  };

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={closeExportToSheetsModal}
      labelledBy="export-to-sheets-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-4" />
          </span>
          <h3 id="export-to-sheets-title" className="text-base font-semibold">
            Copied {rowCount} row{rowCount === 1 ? "" : "s"} to your clipboard
          </h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          shape="square"
          onClick={closeExportToSheetsModal}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <p className="text-sm text-base-content/75">
        Open a new Google Sheet and paste to fill it.
      </p>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleOpenSheet}
        >
          Open new Google Sheet
          <ArrowSquareOut className="size-3.5" />
        </Button>
      </div>
    </Modal>
  );
}
