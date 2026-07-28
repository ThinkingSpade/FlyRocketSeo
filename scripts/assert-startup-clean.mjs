// Deploy guard: fails if a banned SDK's runtime signature is present in the
// biggest minified server chunk (dist/server/assets). No sourcemap needed, so
// it runs on the plain `npm run build` output right before `wrangler deploy`.
//
// It guards the win that is actually keepable: dataforseo-client (1.6 MB) is
// fully removable from startup and regresses the instant someone re-adds a
// static barrel re-export of an SDK-carrying fetcher. The MCP and AI SDKs are
// partly pinned by the `agents`/Think frameworks the chat Durable Objects
// require, so they are not asserted here.
import fs from "node:fs";
import path from "node:path";

const dir = "dist/server/assets";
if (!fs.existsSync(dir)) {
  console.error(`No ${dir}. Run: npm run build`);
  process.exit(2);
}
const [file] = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => [f, fs.statSync(path.join(dir, f)).size])
  .sort((a, b) => b[1] - a[1])[0];
const code = fs.readFileSync(path.join(dir, file), "utf8");

// A distinctive runtime string the SDK actually ships (not the package name,
// which minification/tree-shaking can drop). Confirmed present in a baseline
// build and absent after Phase 1.
const SIGNATURES = { "dataforseo-client": "api.dataforseo.com" };

let failed = false;
for (const [pkg, sig] of Object.entries(SIGNATURES)) {
  if (code.includes(sig)) {
    console.error(
      `FAIL: "${sig}" (${pkg}) is back in the startup chunk ${file}. ` +
        `A static import of an SDK-carrying dataforseo leaf has re-entered startup.`,
    );
    failed = true;
  }
}
if (!failed)
  console.log(`startup chunk ${file} clean of banned SDK signatures.`);
process.exit(failed ? 1 : 0);
