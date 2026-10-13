import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "./middleware";
import {
  previewEvidenceObjects,
  deleteEvidenceOrphans,
} from "@/server/features/opportunities/evidenceCleanup";
import { CLEANUP_BATCH_SIZE } from "@/server/features/opportunities/evidenceCleanupPolicy";

export const previewEvidenceCleanup = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ cursor: z.string().max(2048).optional() }))
  .handler(({ data, context }) => previewEvidenceObjects(context, data.cursor));

export const cleanOrphanedEvidence = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      keys: z.array(z.string().max(2048)).min(1).max(CLEANUP_BATCH_SIZE),
      confirmation: z.literal("DELETE_ORPHANED_EVIDENCE"),
    }),
  )
  .handler(({ data, context }) => deleteEvidenceOrphans(context, data.keys));
