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

// Deploy-time AUTH_MODE contract: the client bundle must be built with
// AUTH_MODE=hosted so the in-app login UI enables (isHostedClientAuthMode reads
// import.meta.env.AUTH_MODE; Vite exposes prefixed process.env vars to it). The
// server runtime half is set in wrangler.jsonc `vars`. Forced (not defaulted) so
// an AUTH_MODE inherited from the build env can't desync the client from the
// hosted runtime. This fork's production builds are always hosted; local dev
// (`vite dev`) doesn't run this wrapper, so it's unaffected.
process.env.AUTH_MODE = "hosted";

execSync("vite build", { stdio: "inherit" });
