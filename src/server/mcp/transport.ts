import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SCOPE } from "@/lib/oauth-resource";
import { resolveCloudflareAccessContext } from "@/middleware/ensure-user/cloudflareAccess";
import { resolveLocalNoAuthContext } from "@/middleware/ensure-user/delegated";
import {
  buildFirstPartyMcpAuthContext,
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
  runWithMcpToolAuthContext,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { registerFlyRocketSeoMcpTools } from "@/server/mcp/server";

function createFlyRocketSeoMcpServer() {
  const server = new McpServer(
    {
      name: "FlyRocketSEO MCP",
      title: "FlyRocketSEO",
      version: "0.0.11",
      description:
        "SEO research tools for AI agents: keyword research and metrics, SERP and local SERP results, domain and backlink analysis, rank tracking, and Google Search Console performance.",
      // Advertised to MCP clients, so both must resolve on this deployment
      // rather than another install.
      websiteUrl: "https://flyrocketseo.huy1999nguyen.workers.dev",
      icons: [
        {
          src: "https://flyrocketseo.huy1999nguyen.workers.dev/android-chrome-512x512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    },
    {
      instructions:
        "FlyRocketSEO research tools call a paid data provider on the operator's own account — there is no credit balance to check. Proceed with normal focused research, but ask the user before running large batches.",
    },
  );
  registerFlyRocketSeoMcpTools(server);

  return server;
}

export async function handleAuthenticatedFlyRocketSeoMcpRequest(
  request: Request,
  props: unknown,
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  const result = workersOAuthMcpPropsSchema.safeParse(props);
  const scopes = result.success
    ? result.data[MCP_AUTH_CONTEXT_PROP].scopes
    : [];

  if (!result.success || !scopes.includes(MCP_SCOPE)) {
    return new Response("MCP auth context required", { status: 403 });
  }

  return handleFlyRocketSeoMcpRequest(request, result.data, env, ctx);
}

export async function handleSelfHostedFlyRocketSeoMcpRequest(
  request: Request,
  authMode: "cloudflare_access" | "local_noauth",
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  // Self-hosted auth mirrors the app: local_noauth uses the local admin
  // workspace, while cloudflare_access trusts Cloudflare's Access JWT.
  // CORS/preflight still needs to reach the MCP transport before auth context
  // exists, so OPTIONS intentionally bypasses context creation.
  if (request.method === "OPTIONS") {
    return handleFlyRocketSeoMcpRequest(request, undefined, env, ctx);
  }

  const baseUrl = getPublicOrigin(request);
  const context =
    authMode === "local_noauth"
      ? await resolveLocalNoAuthContext()
      : await resolveCloudflareAccessContext(request.headers);
  const props = createWorkersOAuthMcpProps(
    buildFirstPartyMcpAuthContext({
      userId: context.userId,
      userEmail: context.userEmail,
      organizationId: context.organizationId,
      baseUrl,
    }),
  );

  return handleFlyRocketSeoMcpRequest(request, props, env, ctx);
}

function handleFlyRocketSeoMcpRequest(
  request: Request,
  props: ReturnType<typeof createWorkersOAuthMcpProps> | undefined,
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  // Decline the optional standalone GET SSE stream: this server is stateless
  // (POST returns JSON) and pushes no server-initiated messages, so the stream
  // does nothing but leak memory — each GET is held open by a keepalive and
  // pins a per-request McpServer (~5MB), so a few dozen concurrent clients OOM
  // the 128MB isolate. 405 is the spec's "no stream" response; returning it
  // before building the server means a GET allocates nothing.
  if (request.method === "GET") {
    return Promise.resolve(
      new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "POST, DELETE, OPTIONS",
          "Access-Control-Allow-Origin": "*",
        },
      }),
    );
  }

  const server = createFlyRocketSeoMcpServer();
  const handler = createMcpHandler(server, {
    route: MCP_ROUTE,
    enableJsonResponse: true,
    authContext: props ? { props } : undefined,
    corsOptions: {
      headers:
        "Authorization, Content-Type, Last-Event-ID, mcp-protocol-version, mcp-session-id",
      exposeHeaders: "mcp-protocol-version, mcp-session-id",
    },
  });

  if (!props) return handler(request, env, ctx);

  return runWithMcpToolAuthContext(props[MCP_AUTH_CONTEXT_PROP], () =>
    handler(request, env, ctx),
  );
}
