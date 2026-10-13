// Test-only entry point: delegates all inbound requests and authorization to
// the actual app while rejecting every external server-side subrequest.
import app from "../../src/server";
export {
  SiteAuditWorkflow,
  RankCheckWorkflow,
  OnboardingChatAgent,
  SamChatAgent,
} from "../../src/server";

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === "https://primary.example" && url.pathname === "/guide") {
    return new Response(
      '<html><body><main><h1>Rocket guide</h1><p>This rocket guide explains launch preparation and choosing useful rocket equipment for a small team.</p><a href="/existing">Existing destination</a></main></body></html>',
      { headers: { "Content-Type": "text/html" } },
    );
  }
  if (
    url.origin === "https://cloudflare-dns.com" &&
    url.pathname === "/dns-query" &&
    url.searchParams.get("name") === "primary.example"
  ) {
    return Response.json({
      Status: 0,
      Answer:
        url.searchParams.get("type") === "A"
          ? [{ type: 1, data: "93.184.216.34" }]
          : [],
    });
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    console.error(
      "ACCEPTANCE_EXTERNAL_REQUEST_BLOCKED",
      url.hostname,
      url.pathname,
    );
    throw new Error(`Acceptance rejects external requests to ${url.hostname}`);
  }
  return nativeFetch(input, init);
};

export default {
  ...app,
  async fetch(request: Request, bindings: Env, context: ExecutionContext) {
    const url = new URL(request.url);
    if (
      url.pathname === "/__acceptance/release-cleanup-fault" &&
      request.method === "POST" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      request.headers.get("x-acceptance-control") === "local-fixture" &&
      bindings.BETTER_AUTH_SECRET ===
        "acceptance-only-secret-never-use-outside-local-tests" &&
      bindings.BETTER_AUTH_URL === "http://localhost:3102"
    ) {
      await bindings.DB.prepare(
        "DROP TRIGGER IF EXISTS acceptance_evidence_cleanup_retry",
      ).run();
      return Response.json({ released: true });
    }
    return app.fetch(request, bindings, context);
  },
};
