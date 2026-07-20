import { createFileRoute } from "@tanstack/react-router";
import { autumnHandler } from "autumn-js/fetch";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";
import { isBillingEnabled } from "@/server/billing/config";

const handler = autumnHandler({
  identify: async (request) => {
    const context = await resolveHostedContext(request.headers);

    return {
      customerId: context.organizationId,
    };
  },
});

async function handleAutumnRequest(request: Request) {
  if (!(await isBillingEnabled())) {
    // JSON, not plain text: the autumn-js client always parses the body, and a
    // text body turns a clean 404 into a noisy JSON-parse console error.
    return Response.json({ error: "billing_disabled" }, { status: 404 });
  }

  return handler(request);
}

export const Route = createFileRoute("/api/autumn/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleAutumnRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleAutumnRequest(request);
      },
    },
  },
});
