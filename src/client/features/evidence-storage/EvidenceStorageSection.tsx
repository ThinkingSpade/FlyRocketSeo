import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import {
  cleanOrphanedEvidence,
  previewEvidenceCleanup,
} from "@/serverFunctions/evidence-storage";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { EvidenceStorageObjects } from "./EvidenceStorageObjects";

type Preview = Awaited<ReturnType<typeof previewEvidenceCleanup>>;
type Cleanup = Awaited<ReturnType<typeof cleanOrphanedEvidence>>;

export function EvidenceStorageSection() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Cleanup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview(cursor?: string) {
    setBusy(true);
    setError(null);
    setConfirmation("");
    setSelected(new Set());
    setPreview(null);
    try {
      setPreview(await previewEvidenceCleanup({ data: { cursor } }));
    } catch (caught) {
      setError(getStandardErrorMessage(caught, "Couldn't preview evidence"));
    } finally {
      setBusy(false);
    }
  }

  async function cleanKeys(keys: string[]) {
    if (!keys.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        await cleanOrphanedEvidence({
          data: {
            keys,
            confirmation: "DELETE_ORPHANED_EVIDENCE",
          },
        }),
      );
      setPreview(null);
      setSelected(new Set());
      setConfirmation("");
    } catch (caught) {
      setError(getStandardErrorMessage(caught, "Couldn't clean evidence"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="space-y-3 rounded-lg border border-base-content/10 p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Evidence storage
      </summary>
      <div className="space-y-4 pt-3 text-sm">
        <p className="text-base-content/70">
          Advanced organization administration. Saved evidence, implementation
          baselines, work history and recorded results are retained.
          Unreferenced evidence becomes eligible after a 24-hour grace period.
          Evidence without a storage record stays protected while its project
          exists.
        </p>
        <p className="text-base-content/70">
          Preview up to 5 objects in the current organization. Owners and
          administrators can select eligible objects for permanent deletion.
          Eligibility is checked again when you confirm. Cleanup runs only when
          requested here.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void loadPreview()}
        >
          {busy ? "Working…" : "Preview stored evidence"}
        </Button>
        {error ? (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        ) : null}
        {result ? (
          <div role="status" className="space-y-2">
            <p>
              Last cleanup: {result.deleted.length} evidence objects deleted.{" "}
              {result.skipped.length} skipped. {result.failed.length} failed.
            </p>
            {result.skipped.map((item) => (
              <p key={item.key} className="break-all text-xs">
                Skipped {item.key}: {item.reason}
              </p>
            ))}
            {result.failed.map((item) => (
              <p key={item.key} className="break-all text-xs">
                Failed {item.key}: {item.reason}
              </p>
            ))}
            {result.failed.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void cleanKeys(result.failed.map((item) => item.key))
                }
              >
                Retry failed cleanup
              </Button>
            ) : null}
          </div>
        ) : null}
        {preview ? (
          <>
            <p role="status">
              {preview.objects.length} objects in this batch.{" "}
              {preview.counts.eligible} eligible for cleanup.
            </p>
            <EvidenceStorageObjects
              objects={preview.objects}
              selected={selected}
              disabled={busy}
              onSelectionChange={(update) => {
                setConfirmation("");
                setSelected(update);
              }}
            />
            {preview.nextCursor ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void loadPreview(preview.nextCursor ?? undefined)
                }
              >
                Preview next batch
              </Button>
            ) : null}
            {selected.size ? (
              <fieldset
                className="space-y-3 rounded-lg border border-red-500/30 p-3"
                disabled={busy}
              >
                <legend className="px-1 font-medium">
                  Confirm permanent deletion
                </legend>
                <p>
                  Delete {selected.size} selected orphaned evidence objects.
                  This cannot be undone.
                </p>
                <label className="block space-y-1">
                  <span>Type DELETE to confirm</span>
                  <Input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={confirmation !== "DELETE" || busy}
                  onClick={() => {
                    if (confirmation === "DELETE")
                      void cleanKeys([...selected]);
                  }}
                >
                  Delete selected orphaned evidence
                </Button>
              </fieldset>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}
