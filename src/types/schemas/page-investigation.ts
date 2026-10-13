import { z } from "zod";
import { GSC_DEVICES, SEARCH_PERFORMANCE_RANGES } from "./search-performance";

export const investigationScopeShape = {
  dateRange: z.enum(SEARCH_PERFORMANCE_RANGES).default("last_28_days"),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  country: z
    .string()
    .regex(/^[a-zA-Z]{3}$/)
    .transform((v) => v.toLowerCase())
    .optional(),
  device: z.enum(GSC_DEVICES).optional(),
  searchType: z.enum(["web", "image", "video", "news"]).default("web"),
};

export const pageInvestigationInputSchema = z
  .object({
    projectId: z.string().min(1),
    url: z.string().url().max(2048),
    ...investigationScopeShape,
  })
  .superRefine((value, context) => {
    if (Boolean(value.startDate) !== Boolean(value.endDate)) {
      context.addIssue({
        code: "custom",
        message: "Choose both dates",
        path: ["endDate"],
      });
    }
    if (value.startDate && value.endDate) {
      const days =
        (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86_400_000 +
        1;
      if (days < 1 || days > 93)
        context.addIssue({
          code: "custom",
          message: "Choose an ordered window of up to 93 days",
          path: ["endDate"],
        });
    }
  });

export type PageInvestigationInput = z.infer<
  typeof pageInvestigationInputSchema
>;
