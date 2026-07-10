import { createServerFn } from "@tanstack/react-start";
import { ReportBrandingRepository } from "@/server/features/report/repositories/ReportBrandingRepository";
import { ReportSharesRepository } from "@/server/features/report/repositories/ReportSharesRepository";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createReportShareSchema,
  getReportBrandingSchema,
  listReportSharesSchema,
  revokeReportShareSchema,
  updateReportBrandingSchema,
} from "@/types/schemas/report";

// Belt-and-braces beyond the per-field zod bounds: a snapshot with a maximal
// logo comfortably fits; anything past this is malformed input.
const MAX_SNAPSHOT_JSON_BYTES = 400_000;

export const getReportBranding = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getReportBrandingSchema)
  .handler(async ({ context }) =>
    ReportBrandingRepository.getForProject(context.projectId),
  );

export const updateReportBranding = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateReportBrandingSchema)
  .handler(async ({ data, context }) =>
    ReportBrandingRepository.upsert(context.projectId, {
      brandName: data.brandName,
      preparedBy: data.preparedBy,
      logoDataUri: data.logoDataUri,
    }),
  );

export const createReportShare = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createReportShareSchema)
  .handler(async ({ data, context }) => {
    const snapshotJson = JSON.stringify(data.snapshot);
    if (snapshotJson.length > MAX_SNAPSHOT_JSON_BYTES) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Report snapshot is too large to share.",
      );
    }
    return ReportSharesRepository.create({
      projectId: context.projectId,
      createdByUserId: context.userId,
      rangeKey: data.rangeKey,
      title: data.title,
      snapshotJson,
    });
  });

export const listReportShares = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listReportSharesSchema)
  .handler(async ({ context }) =>
    ReportSharesRepository.listForProject(context.projectId),
  );

export const revokeReportShare = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(revokeReportShareSchema)
  .handler(async ({ data, context }) => {
    await ReportSharesRepository.revoke(context.projectId, data.shareId);
    return { ok: true as const };
  });
