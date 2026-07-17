// Runs `vite build` with a default V8 heap ceiling so the bundle step doesn't
// run out of memory in constrained CI (Cloudflare Workers Builds OOMs at Node's
// ~2 GB default on this app). Respects an existing NODE_OPTIONS — the
// `sourcemaps:upload` script sets 8192 and that must win — by only adding the
// flag when no --max-old-space-size is already present. Pure Node, so it behaves
// identically on the Linux CI and on local Windows.
import { execSync } from "node:child_process";

const existing = process.env.NODE_OPTIONS ?? "";
if (!/--max-old-space-size/.test(existing)) {
  process.env.NODE_OPTIONS = `${existing} --max-old-space-size=4096`.trim();
}

execSync("vite build", { stdio: "inherit" });
