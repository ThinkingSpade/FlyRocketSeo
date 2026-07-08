import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  businessProfileRequestSchema,
  reviewsResultRequestSchema,
  startReviewsRequestSchema,
} from "@/types/schemas/local-seo";
import { LocalSeoService } from "@/server/features/local-seo/services/LocalSeoService";

export const getBusinessProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(businessProfileRequestSchema)
  .handler(async ({ data, context }) => {
    return LocalSeoService.getBusinessProfile(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const startBusinessReviews = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(startReviewsRequestSchema)
  .handler(async ({ data, context }) => {
    return LocalSeoService.startReviewsFetch(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const getBusinessReviewsResult = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reviewsResultRequestSchema)
  .handler(async ({ data }) => {
    return LocalSeoService.getReviewsResult(data.taskId);
  });
