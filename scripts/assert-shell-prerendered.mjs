// Deploy guard: fails if the prerendered SPA shell is missing from the build
// output, so a deploy cannot silently ship without it.
//
// Why this needs a guard at all: the shell is the entire cold-start story. With
// dist/client/index.html present, Workers Assets serves every page route from
// the edge in ~25-90ms and the loading animation paints instantly. Without it,
// `not_found_handling: "single-page-application"` has nothing to serve, so
// every page route falls through to the Worker and pays the full cold-isolate
// cost (measured ~5-8s), AND the SSR path returns HTTP 500 for routes that SPA
// mode never intended the server to render. This exact regression reached
// production on 2026-07-28: `/index.html` 404'd while `/favicon.ico` served in
// 80ms, and `/` and `/sign-in` were 500s at 6-8s.
//
// The failure is silent by nature -- the prerender step boots an ephemeral vite
// server and fetches "/", which can fail under machine contention (a stray
// wrangler-dev workerd). `spa.prerender.retryCount` in vite.config.ts reduces
// that, but retries can still be exhausted, and nothing downstream notices a
// missing file. Hence this check, wired into `deploy` alongside
// assert-startup-clean.mjs.
import fs from "node:fs";

const SHELL = "dist/client/index.html";

if (!fs.existsSync(SHELL)) {
  console.error(
    `FAIL: ${SHELL} is missing. The SPA shell prerender did not run or did ` +
      `not finish.\n` +
      `Deploying now would send every page route through the cold Worker ` +
      `(~5-8s + HTTP 500s) instead of the ~25-90ms edge-served shell.\n` +
      `Fix: kill any stray workerd/wrangler-dev processes, then re-run ` +
      `npm run build and check for the "[prerender] Prerendered 1 pages" line.`,
  );
  process.exit(1);
}

const html = fs.readFileSync(SHELL, "utf8");

// A shell that exists but rendered empty is the same outage with extra steps:
// the point is that it carries the loading animation, so assert the markup is
// actually there rather than just the file. LoadingShell is self-contained
// (inline styles + one <style> block), so its keyframes are the reliable
// signature -- no app CSS is involved.
const REQUIRED = [
  ["@keyframes", "the LoadingShell animation"],
  ["<div", "rendered shell markup"],
];

const missing = REQUIRED.filter(([needle]) => !html.includes(needle));
if (missing.length > 0) {
  console.error(
    `FAIL: ${SHELL} exists (${html.length} bytes) but is missing ` +
      missing.map(([, what]) => what).join(" and ") +
      `.\nA blank shell paints nothing, which is the blank-cold-start bug ` +
      `the shell was built to fix.`,
  );
  process.exit(1);
}

console.log(
  `SPA shell ${SHELL} present (${html.length} bytes) with loading animation.`,
);
