// Reads a sourcemap SSR build (dist-sourcemaps/server/assets), reports the
// biggest chunk's composition, and optionally asserts that named packages are
// absent from it. The development-time guard for the startup-bundle work; the
// deploy guard is scripts/assert-startup-clean.mjs (no sourcemap needed).
import fs from "node:fs";
import path from "node:path";
import { attribute } from "./attribute-bundle.mjs";

const dir = "dist-sourcemaps/server/assets";
if (!fs.existsSync(dir)) {
  console.error(`No ${dir}. Run: npm run perf:startup`);
  process.exit(2);
}
const jsFiles = fs
  .readdirSync(dir)
  .filter(
    (f) => f.endsWith(".js") && fs.existsSync(path.join(dir, f + ".map")),
  );
const [file, size] = jsFiles
  .map((f) => [f, fs.statSync(path.join(dir, f)).size])
  .sort((a, b) => b[1] - a[1])[0];
const { ranked } = attribute(path.join(dir, file + ".map"));
const chunkKb = Math.round(size / 1024);
console.log(`startup chunk: ${file}  ${chunkKb} KB`);
console.log("top contributors (KB):");
for (const [name, kb] of ranked.slice(0, 30))
  console.log(`  ${String(kb).padStart(6)}  ${name}`);

const args = process.argv.slice(2);
const absentArg =
  args.indexOf("--assert-absent") !== -1
    ? args[args.indexOf("--assert-absent") + 1]
    : null;
const maxKbArg =
  args.indexOf("--max-kb") !== -1
    ? Number(args[args.indexOf("--max-kb") + 1])
    : null;
// Small residue (erased types, re-exports) is fine; real runtime code is not.
const THRESHOLD_KB = 20;
let failed = false;
if (absentArg) {
  for (const pkg of absentArg.split(",")) {
    const hit = ranked.find(([name]) => name === `npm:${pkg}`);
    if (hit && hit[1] > THRESHOLD_KB) {
      console.error(
        `FAIL: ${pkg} contributes ${hit[1]} KB to the startup chunk (want <= ${THRESHOLD_KB}).`,
      );
      failed = true;
    }
  }
}
if (maxKbArg && chunkKb > maxKbArg) {
  console.error(
    `FAIL: startup chunk ${chunkKb} KB exceeds --max-kb ${maxKbArg}.`,
  );
  failed = true;
}
process.exit(failed ? 1 : 0);
