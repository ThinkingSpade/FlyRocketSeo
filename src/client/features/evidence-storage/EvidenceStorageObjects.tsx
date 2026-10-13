import type { Dispatch, SetStateAction } from "react";
import type { previewEvidenceCleanup } from "@/serverFunctions/evidence-storage";

type StoredObject = Awaited<
  ReturnType<typeof previewEvidenceCleanup>
>["objects"][number];
const reasons = {
  eligible: "Unreferenced and past the grace period",
  referenced: "Protected by saved evidence or history",
  recent: "Protected by the grace period",
  busy: "A storage write is still active",
  legacy: "Protected: no storage write record",
  invalid: "Protected: storage record could not be verified",
};

export function EvidenceStorageObjects({
  objects,
  selected,
  disabled,
  onSelectionChange,
}: {
  objects: StoredObject[];
  selected: Set<string>;
  disabled: boolean;
  onSelectionChange: Dispatch<SetStateAction<Set<string>>>;
}) {
  if (!objects.length) return <p>No evidence objects in this batch.</p>;
  return (
    <ul aria-label="Stored evidence objects" className="space-y-2">
      {objects.map((object) => (
        <li
          key={object.key}
          className="rounded border border-base-content/10 p-3"
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              aria-label={`Select ${object.key}`}
              checked={selected.has(object.key)}
              disabled={disabled || object.disposition !== "eligible"}
              onChange={(event) => {
                const checked = event.target.checked;
                onSelectionChange((previous) => {
                  const next = new Set(previous);
                  if (checked) next.add(object.key);
                  else next.delete(object.key);
                  return next;
                });
              }}
            />
            <span className="min-w-0 space-y-1">
              <span className="block break-all font-mono text-xs">
                {object.key}
              </span>
              <span className="block text-xs text-base-content/70">
                {reasons[object.disposition]}
              </span>
              <span className="block text-xs text-base-content/50">
                {object.size} bytes · Uploaded {object.uploadedAt}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
