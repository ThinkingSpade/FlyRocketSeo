import { createFileRoute } from "@tanstack/react-router";
import { ReportSharesRepository } from "@/server/features/report/repositories/ReportSharesRepository";

// Public, unauthenticated read for shared client reports. The 256-bit token
// is the entire capability: possession grants read access to ONE frozen
// snapshot; there is no listing, no enumeration (unique-index lookup only),
// and a revoked share is indistinguishable from a nonexistent one.
//
// Note for Cloudflare Access self-hosts: Access sits in front of the whole
// Worker, so `/r/*` and `/api/report-share/*` need a bypass policy for links
// to work outside the team (see docs/DEPLOY_INTERNET_FACING.md).

// base64url of 32 random bytes is exactly 43 chars; reject other shapes
// before touching the database.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,48}$/;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Shared reports are for the recipient, not for search engines; no-store
  // makes revocation take effect immediately.
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "no-store",
  // Public endpoint returning user-influenced strings — don't let a browser
  // sniff the JSON into anything executable.
  "x-content-type-options": "nosniff",
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handleGet(request: Request): Promise<Response> {
  const segments = new URL(request.url).pathname.split("/");
  const token = segments[segments.length - 1] ?? "";
  if (!TOKEN_SHAPE.test(token)) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  try {
    const share = await ReportSharesRepository.findActiveByToken(token);
    if (!share) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    return jsonResponse(
      {
        title: share.title,
        rangeKey: share.rangeKey,
        createdAt: share.createdAt,
        snapshot: JSON.parse(share.snapshotJson) as unknown,
      },
      200,
    );
  } catch {
    return jsonResponse({ error: "internal_error" }, 500);
  }
}

export const Route = createFileRoute("/api/report-share/$token")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleGet(request),
    },
  },
});
