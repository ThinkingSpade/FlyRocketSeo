import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { WorkspaceRepository } from "@/server/auth/repositories/WorkspaceRepository";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  listWorkspacesForContext,
  switchActiveWorkspaceForUser,
} from "@/serverFunctions/workspaces-handler";

const switchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    listWorkspacesForContext(context, {
      listWorkspacesForUser: WorkspaceRepository.listWorkspacesForUser,
    }),
  );

export const switchWorkspace = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(switchWorkspaceSchema)
  .handler(async ({ data, context }) =>
    switchActiveWorkspaceForUser(
      // `context.userId` comes from the resolved session, `data.workspaceId`
      // from the request body. Only the first is trusted; the handler's job is
      // to refuse to let the second name a workspace the first cannot reach.
      { userId: context.userId, requestedWorkspaceId: data.workspaceId },
      {
        listWorkspacesForUser: WorkspaceRepository.listWorkspacesForUser,
        isHostedServerAuthMode,
        // Better Auth owns the session, so it performs the write — the same
        // call `resolveHostedContext` makes when it repairs a session pointing
        // at a delegated organization.
        //
        // Worth stating because this app enables `session.cookieCache` for five
        // minutes: a switch that only updated the session ROW would be read
        // back from a stale cookie and appear to do nothing until the cache
        // expired. It does not, because `set-active` finishes with
        // `setSessionCookie`, which rewrites the cached session too, and the
        // `tanstackStartCookies` plugin forwards those Set-Cookie headers onto
        // this server function's response.
        setActiveOrganization: async (organizationId) => {
          await getAuth().api.setActiveOrganization({
            headers: getRequest().headers,
            body: { organizationId },
          });
        },
      },
    ),
  );
