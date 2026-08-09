import { WarningCircle, CircleNotch } from "@phosphor-icons/react";
import { Modal } from "@/client/components/Modal";
import { Button } from "@cloudflare/kumo/components/button";

export function RemoveSavedKeywordsError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
      <WarningCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function DeleteSavedKeywordsModal({
  selectedCount,
  isPending,
  onClose,
  onConfirm,
}: {
  selectedCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal onClose={onClose} labelledBy="delete-keywords-title">
      <h3 id="delete-keywords-title" className="text-lg font-semibold">
        Delete keywords?
      </h3>
      <p className="text-sm text-base-content/70">
        This will permanently delete {selectedCount} saved keyword
        {selectedCount !== 1 ? "s" : ""}.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? <CircleNotch className="size-3 animate-spin" /> : null}
          Delete {selectedCount} keyword
          {selectedCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </Modal>
  );
}
