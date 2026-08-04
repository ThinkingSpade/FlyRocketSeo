import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  importCitySitesChunk,
  previewCitySiteImport,
} from "@/serverFunctions/citySites";
import type { CitySitePreview } from "@/server/features/city-sites/services/CitySiteService";
import {
  CITY_SITE_STATUS_META,
  CITY_SITE_STATUS_ORDER,
  formatCityLabel,
} from "./citySiteStatus";

const PREVIEW_SAMPLE_SIZE = 8;
const SKIPPED_SAMPLE_SIZE = 5;

const PLACEHOLDER = `austin.example.com
dallas.example.com
san-antonio.example.com
https://st-louis.example.com/`;

/**
 * Paste hosts, see what they resolve to, then write them.
 *
 * The preview step is not decoration. Importing 2,000 subdomains is a bulk
 * write against a live project, and the failure mode worth designing against
 * is not "the import errored" — it is "400 rows silently landed on the wrong
 * city". So nothing is written until the user has seen the counts, and the
 * import button says exactly how many rows it will add.
 */
export function CitySiteImportModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = React.useState("");
  const [preview, setPreview] = React.useState<CitySitePreview | null>(null);
  const [importedCount, setImportedCount] = React.useState(0);
  const [isImporting, setIsImporting] = React.useState(false);

  const previewMutation = useMutation({
    mutationFn: () => previewCitySiteImport({ data: { projectId, text } }),
    onSuccess: setPreview,
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not read that list")),
  });

  const newRowCount = preview
    ? preview.rows.filter((row) => !row.alreadyImported).length
    : 0;

  /**
   * Walks the import one server-side chunk at a time.
   *
   * The loop lives here rather than on the server because this deployment is
   * on the Workers Free plan: one request cannot carry 2,000 rows within the
   * CPU ceiling, so the browser drives the sequence — the same shape the geo
   * location seed already uses from Settings. `processed` comes back from the
   * server and becomes the next offset, so a chunk is never skipped or
   * repeated on the basis of a client-side guess.
   */
  const runImport = async () => {
    if (!preview || isImporting) return;
    setIsImporting(true);
    setImportedCount(0);

    try {
      let offset = 0;
      // Every chunk must consume at least one host, so this many iterations
      // cannot be exceeded by a healthy run. It bounds the loop in case a
      // chunk ever comes back without advancing, rather than spinning the
      // browser on an endless sequence of identical requests.
      const maxIterations = preview.rows.length + 1;

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const result = await importCitySitesChunk({
          data: { projectId, text, offset },
        });
        setImportedCount((count) => count + result.imported);
        if (result.done) break;
        if (result.processed <= offset) {
          throw new Error("Import stopped making progress.");
        }
        offset = result.processed;
      }

      await queryClient.invalidateQueries({
        queryKey: ["citySites", projectId],
      });
      toast.success("City sites imported");
      onClose();
    } catch (error) {
      toast.error(getStandardErrorMessage(error, "Import failed"));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      maxWidth="max-w-2xl"
      onClose={isImporting ? undefined : onClose}
      labelledBy="import-city-sites-title"
    >
      <h2 id="import-city-sites-title" className="text-lg font-semibold">
        Import city subdomains
      </h2>
      <p className="text-sm text-base-content/60">
        Paste one hostname per line, or a CSV whose first column is the
        hostname. Each city is matched to its location automatically — nothing
        is charged, and nothing is written until you confirm.
      </p>

      <textarea
        className="textarea textarea-bordered h-40 w-full font-mono text-xs"
        placeholder={PLACEHOLDER}
        value={text}
        disabled={isImporting}
        onChange={(event) => {
          setText(event.target.value);
          setPreview(null);
        }}
      />

      {preview ? (
        <PreviewSummary preview={preview} newRowCount={newRowCount} />
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          disabled={isImporting}
        >
          Cancel
        </button>

        {preview ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isImporting || newRowCount === 0}
            onClick={() => void runImport()}
          >
            {isImporting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importing {importedCount.toLocaleString()} of{" "}
                {newRowCount.toLocaleString()}
              </>
            ) : (
              `Import ${newRowCount.toLocaleString()} site${newRowCount === 1 ? "" : "s"}`
            )}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!text.trim() || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking
              </>
            ) : (
              "Preview match"
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "warning"
      ? "border-warning/40 bg-warning/10"
      : "border-base-300 bg-base-200/50";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${toneClass}`}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-base-content/50" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PreviewSummary({
  preview,
  newRowCount,
}: {
  preview: CitySitePreview;
  newRowCount: number;
}) {
  const sample = preview.rows.slice(0, PREVIEW_SAMPLE_SIZE);

  return (
    <div className="space-y-3">
      {preview.geoTableEmpty ? (
        <Notice tone="warning">
          The location table has not been seeded on this deployment yet, so no
          city can be matched. Seed it from{" "}
          <span className="font-medium">Settings → Seed location data</span>,
          then import again — the hosts will import either way, but every row
          will need a city picked by hand until then.
        </Notice>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {CITY_SITE_STATUS_ORDER.map((status) => (
          <div
            key={status}
            className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2"
          >
            <div className="text-lg font-semibold tabular-nums">
              {preview.counts[status].toLocaleString()}
            </div>
            <div className="text-xs text-base-content/60">
              {CITY_SITE_STATUS_META[status].label}
            </div>
          </div>
        ))}
      </div>

      {preview.alreadyImportedCount > 0 ? (
        <Notice tone="info">
          {preview.alreadyImportedCount.toLocaleString()} of these are already
          in this project and will be left alone. {newRowCount.toLocaleString()}{" "}
          will be added.
        </Notice>
      ) : null}

      {preview.truncatedCount > 0 ? (
        <Notice tone="warning">
          This list is longer than one import can take, so{" "}
          {preview.truncatedCount.toLocaleString()} host
          {preview.truncatedCount === 1 ? " was" : "s were"} left out. Import
          this batch, then paste the rest.
        </Notice>
      ) : null}

      {preview.skipped.length > 0 ? (
        <Notice tone="warning">
          <div className="font-medium">
            {preview.skipped.length.toLocaleString()} line
            {preview.skipped.length === 1 ? "" : "s"} skipped
          </div>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-base-content/60">
            {preview.skipped.slice(0, SKIPPED_SAMPLE_SIZE).map((line) => (
              <li key={`${line.reason}:${line.value}`} className="truncate">
                {line.value} — {line.reason.replace(/-/gu, " ")}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {sample.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-base-300">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>City</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((row) => (
                <tr key={row.host}>
                  <td className="font-mono text-xs">{row.host}</td>
                  <td>
                    {formatCityLabel(row.cityName, row.stateCode) ?? (
                      <span className="text-base-content/40">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm ${CITY_SITE_STATUS_META[row.matchStatus].badgeClass}`}
                    >
                      {CITY_SITE_STATUS_META[row.matchStatus].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.rows.length > sample.length ? (
            <div className="border-t border-base-300 px-3 py-2 text-xs text-base-content/50">
              Showing the first {sample.length} of{" "}
              {preview.rows.length.toLocaleString()}.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
