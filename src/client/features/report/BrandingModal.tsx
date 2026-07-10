import { useEffect, useState } from "react";
import { ImageOff, Loader2, Palette, Upload } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { updateReportBranding } from "@/serverFunctions/report";
import { reportBrandingQueryKey, useReportBranding } from "./useReportBranding";

// Matches the server-side zod bound (~128KB of raster image as base64).
const MAX_LOGO_BYTES = 128 * 1024;
const ACCEPTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * White-label the client report: agency/brand name, a "prepared by" line,
 * and a small logo. The logo is stored as a data URI so printed reports and
 * public share links never depend on an external image host.
 */
export function BrandingModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: branding, isLoading } = useReportBranding(projectId);

  const [brandName, setBrandName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);

  // Seed the form once the stored settings arrive.
  useEffect(() => {
    if (!branding) return;
    setBrandName(branding.brandName ?? "");
    setPreparedBy(branding.preparedBy ?? "");
    setLogoDataUri(branding.logoDataUri ?? null);
  }, [branding]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateReportBranding({
        data: {
          projectId,
          brandName,
          preparedBy,
          logoDataUri,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: reportBrandingQueryKey(projectId),
      });
      captureClientEvent("report:branding_update");
      toast.success("Report branding saved");
      onClose();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
      toast.error("Logo must be a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 128KB — try a smaller export.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setLogoDataUri(reader.result);
    });
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="report-branding-title"
      maxWidth="max-w-md"
    >
      <div>
        <h3
          id="report-branding-title"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Palette className="size-4" />
          Report branding
        </h3>
        <p className="text-xs text-base-content/60">
          Put your agency on the report. These appear in the header of this
          project&apos;s reports, PDFs, and shared links.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-4 animate-spin text-base-content/50" />
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saveMutation.isPending) saveMutation.mutate();
          }}
        >
          <label className="form-control w-full">
            <span className="label-text pb-1 text-xs font-medium">
              Agency / brand name
            </span>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              placeholder="e.g. Northwind SEO"
              value={brandName}
              maxLength={80}
              onChange={(event) => setBrandName(event.target.value)}
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text pb-1 text-xs font-medium">
              Prepared by
            </span>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              placeholder="e.g. Huy Nguyen"
              value={preparedBy}
              maxLength={80}
              onChange={(event) => setPreparedBy(event.target.value)}
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium">Logo</span>
            <div className="flex items-center gap-3">
              {logoDataUri ? (
                <img
                  src={logoDataUri}
                  alt="Report logo preview"
                  className="max-h-12 max-w-32 rounded border border-base-300 bg-base-100 object-contain p-1"
                />
              ) : (
                <span className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-base-300 text-base-content/30">
                  <ImageOff className="size-4" />
                </span>
              )}
              <div className="flex flex-col gap-1">
                <label className="btn btn-sm btn-ghost w-fit gap-1.5">
                  <Upload className="size-3.5" />
                  Upload image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      handleLogoFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                {logoDataUri ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs w-fit text-base-content/50"
                    onClick={() => setLogoDataUri(null)}
                  >
                    Remove logo
                  </button>
                ) : (
                  <span className="text-[11px] text-base-content/50">
                    PNG, JPEG, or WebP · under 128KB
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Save branding
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
