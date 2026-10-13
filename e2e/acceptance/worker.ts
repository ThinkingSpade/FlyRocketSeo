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

export default app;
