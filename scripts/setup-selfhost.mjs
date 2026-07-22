// @ts-check
/**
 * One-command self-host provisioning for a forked OpenSEO deploy.
 *
 * Creates the Cloudflare account-scoped resources this Worker needs (2x KV, D1,
 * R2, and — on the Postgres path — a Hyperdrive config), then patches their IDs
 * into wrangler.jsonc IN PLACE while preserving the file's comments.
 *
 * It never mutates anything without first making a wrangler.jsonc.bak backup,
 * and `--dry-run` prints the plan without creating or editing anything.
 *
 * Usage (from repo root):
 *   node scripts/setup-selfhost.mjs --dry-run              # see the plan first
 *   node scripts/setup-selfhost.mjs                        # D1 path
 *   POSTGRES_DATABASE_URL=postgres://user:pass@host/db \
 *     node scripts/setup-selfhost.mjs --postgres           # Postgres + Hyperdrive
 *   node scripts/setup-selfhost.mjs --worker-name flyrocketseo2
 *
 * Flags:
 *   --postgres            Also create a Hyperdrive config from POSTGRES_DATABASE_URL.
 *   --worker-name <name>  Rename the Worker in wrangler.jsonc (fixes the dashboard
 *                         name-mismatch warning). Optional.
 *   --dry-run             Print planned actions only. No creates, no file writes.
 *   --yes                 Skip the confirmation prompt before patching.
 *   --wrangler <cmd>      Override how wrangler is invoked (default: "pnpm exec wrangler").
 *
 * The Postgres connection string is read from the POSTGRES_DATABASE_URL env var
 * (never a CLI arg) so it does not land in your shell history, and is never
 * printed by this script.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");

const { values } = parseArgs({
  options: {
    postgres: { type: "boolean", default: false },
    "worker-name": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    wrangler: { type: "string", default: "pnpm exec wrangler" },
    // Resource names. Defaults match the names already in wrangler.jsonc so that
    // only IDs need patching. Override if those names already exist in your account.
    "d1-name": { type: "string", default: "open-seo" },
    "r2-name": { type: "string", default: "open-seo" },
    "kv-title": { type: "string", default: "open-seo" },
    "oauth-kv-title": { type: "string", default: "open-seo-oauth" },
    "hyperdrive-name": { type: "string", default: "open-seo" },
  },
});

const DRY = values["dry-run"];
const WRANGLER = values.wrangler;

/** Console helpers (plain, no colors — Windows-friendly). */
const log = (m) => console.log(m);
const step = (m) => console.log(`\n=== ${m} ===`);
const warn = (m) => console.warn(`! ${m}`);
const die = (m) => {
  console.error(`\nFATAL: ${m}`);
  process.exit(1);
};

/** Run a wrangler subcommand and return trimmed stdout. */
function wrangler(args, { allowFail = false } = {}) {
  const cmd = `${WRANGLER} ${args}`;
  // Redact anything that looks like a connection string when logging.
  log(`  $ ${cmd.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://***")}`);
  if (DRY) return "";
  try {
    return execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFail) return String(err.stdout || "") + String(err.stderr || "");
    die(`command failed: ${cmd}\n${err.stdout || ""}${err.stderr || ""}`);
  }
}

/** Extract the first JSON array/object embedded in mixed wrangler output. */
function looseJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  for (let end = text.length; end > start; end--) {
    try {
      return JSON.parse(text.slice(start, end));
    } catch {
      /* keep shrinking */
    }
  }
  return null;
}

const HEX32 = /\b[0-9a-f]{32}\b/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/;

let rl;
async function prompt(q) {
  rl ??= createInterface({ input: stdin, output: stdout });
  return (await rl.question(q)).trim();
}

/** Pull an id out of command output, or ask the user to paste it as a fallback. */
async function idFrom(output, pattern, label) {
  const m = output.match(pattern);
  if (m) return m[0];
  if (DRY) return `<${label}-id>`;
  warn(`Could not auto-detect the ${label} id from wrangler output.`);
  return prompt(`Paste the ${label} id: `);
}

// ---- Resource provisioners (idempotent: reuse if the name already exists) ----

async function ensureKv(title) {
  const list =
    looseJson(wrangler(`kv namespace list`, { allowFail: true })) ?? [];
  const found =
    Array.isArray(list) &&
    list.find((n) => n.title === title || n.title?.endsWith(title));
  if (found?.id) {
    log(`  reusing existing KV "${title}" (${found.id})`);
    return found.id;
  }
  const out = wrangler(`kv namespace create ${JSON.stringify(title)}`);
  return idFrom(out, HEX32, `KV "${title}"`);
}

async function ensureD1(name) {
  const list = looseJson(wrangler(`d1 list --json`, { allowFail: true })) ?? [];
  const found = Array.isArray(list) && list.find((d) => d.name === name);
  if (found?.uuid) {
    log(`  reusing existing D1 "${name}" (${found.uuid})`);
    return found.uuid;
  }
  const out = wrangler(`d1 create ${JSON.stringify(name)}`);
  return idFrom(out, UUID, `D1 "${name}"`);
}

function ensureR2(name) {
  const out = wrangler(`r2 bucket create ${JSON.stringify(name)}`, {
    allowFail: true,
  });
  if (/already exists|already owned/i.test(out)) {
    log(`  reusing existing R2 bucket "${name}"`);
    return;
  }
  // R2 must be activated once per account; wrangler surfaces that as error
  // 10042. Fail loudly — a missing bucket only explodes later, at deploy time.
  if (/\[ERROR\]|error code|failed/i.test(out)) {
    die(
      `R2 bucket creation failed. If the error mentions enabling R2 (code 10042),\n` +
        `activate R2 once in the Cloudflare dashboard (sidebar -> R2 Object Storage ->\n` +
        `subscribe to the $0 plan), then re-run this script.\n\nwrangler output:\n${out}`,
    );
  }
  // Success — R2 binds by name, so there is no id to capture.
}

async function ensureHyperdrive(name, connString) {
  const out = wrangler(
    `hyperdrive create ${JSON.stringify(name)} --connection-string=${JSON.stringify(connString)}`,
    { allowFail: true },
  );
  if (/already exists/i.test(out)) {
    const list = wrangler(`hyperdrive list`, { allowFail: true });
    return idFrom(list, UUID, `Hyperdrive "${name}"`);
  }
  return idFrom(out, UUID, `Hyperdrive "${name}"`);
}

// ---- Comment-preserving JSONC patchers (regex-targeted, not full re-serialize) ----

/** Replace the `id` of the kv_namespaces object whose binding === bindingName. */
function patchKvId(src, bindingName, newId) {
  const re = new RegExp(
    `("binding"\\s*:\\s*"${bindingName}"[\\s\\S]{0,160}?"id"\\s*:\\s*")[^"]+(")`,
  );
  if (!re.test(src))
    throw new Error(
      `could not locate KV binding "${bindingName}" in wrangler.jsonc`,
    );
  return src.replace(re, `$1${newId}$2`);
}

function patchD1Id(src, newId) {
  const re = /("d1_databases"[\s\S]*?"database_id"\s*:\s*")[^"]+(")/;
  if (!re.test(src))
    throw new Error(
      `could not locate d1_databases.database_id in wrangler.jsonc`,
    );
  return src.replace(re, `$1${newId}$2`);
}

function patchHyperdriveId(src, newId) {
  const re = /("hyperdrive"\s*:\s*\[\s*\{[\s\S]*?"id"\s*:\s*")[^"]+(")/;
  if (!re.test(src))
    throw new Error(`could not locate hyperdrive[0].id in wrangler.jsonc`);
  return src.replace(re, `$1${newId}$2`);
}

/** Comment out the whole hyperdrive block (D1 path): wrangler deploy validates
 *  the binding, and an id from another account fails the deploy even though D1
 *  never uses it. Idempotent — a no-op if the block is already commented/absent. */
function commentOutHyperdrive(src) {
  const re = /^([ \t]*)"hyperdrive"\s*:\s*\[[\s\S]*?^\1\],[ \t]*$/m;
  const m = src.match(re);
  if (!m) return src;
  const commented = m[0]
    .split("\n")
    .map((line) =>
      line.trim() === "" ? line : line.replace(/^(\s*)/, "$1// "),
    )
    .join("\n");
  return src.replace(re, commented);
}

/** Re-enable a previously commented hyperdrive block (Postgres path). Idempotent. */
function uncommentHyperdrive(src) {
  const re = /^([ \t]*)\/\/ "hyperdrive"\s*:\s*\[[\s\S]*?^\1\/\/ \],[ \t]*$/m;
  const m = src.match(re);
  if (!m) return src;
  const uncommented = m[0]
    .split("\n")
    .map((line) => line.replace(/^(\s*)\/\/ ?/, "$1"))
    .join("\n");
  return src.replace(re, uncommented);
}

/** Replace the first top-level "name" (the Worker name, before any nested block). */
function patchWorkerName(src, newName) {
  return src.replace(
    /"name"\s*:\s*"[^"]+"/,
    `"name": ${JSON.stringify(newName)}`,
  );
}

// ---------------------------------- main ----------------------------------

async function main() {
  if (!existsSync(WRANGLER_PATH))
    die(`wrangler.jsonc not found at ${WRANGLER_PATH}`);

  const usePostgres = values.postgres;
  const pgUrl = process.env.POSTGRES_DATABASE_URL;
  if (usePostgres && !pgUrl && !DRY) {
    die(
      "--postgres requires a POSTGRES_DATABASE_URL env var (the direct Postgres connection\n" +
        "string Hyperdrive should pool). Set it and re-run, e.g.:\n" +
        '  POSTGRES_DATABASE_URL="postgres://user:pass@host:5432/db" node scripts/setup-selfhost.mjs --postgres',
    );
  }

  step("Preflight");
  const who = wrangler(`whoami`, { allowFail: true });
  if (!DRY && /not authenticated|run `?wrangler login/i.test(who)) {
    die("Not logged in to Cloudflare. Run:  pnpm exec wrangler login");
  }
  log(
    DRY ? "  (dry run — no changes will be made)" : "  wrangler authenticated.",
  );

  step("Provisioning Cloudflare resources");
  const kvId = await ensureKv(values["kv-title"]);
  const oauthKvId = await ensureKv(values["oauth-kv-title"]);
  const d1Id = await ensureD1(values["d1-name"]);
  ensureR2(values["r2-name"]);
  let hyperdriveId;
  if (usePostgres) {
    hyperdriveId = await ensureHyperdrive(
      values["hyperdrive-name"],
      pgUrl ?? "",
    );
  }

  step("Planned wrangler.jsonc edits");
  log(`  KV        -> ${kvId}`);
  log(`  OAUTH_KV  -> ${oauthKvId}`);
  log(`  DB (D1)   -> ${d1Id}`);
  if (values["worker-name"]) log(`  name      -> ${values["worker-name"]}`);
  log(
    usePostgres
      ? `  hyperdrive-> re-enabled + ${hyperdriveId}`
      : "  hyperdrive-> commented out (unused on the D1 default)",
  );

  if (DRY) {
    log("\nDry run complete. Re-run without --dry-run to apply.");
    rl?.close();
    return;
  }

  if (!values.yes) {
    const ans = await prompt("\nApply these edits to wrangler.jsonc? (y/N) ");
    if (!/^y(es)?$/i.test(ans)) {
      log("Aborted. No files changed.");
      rl?.close();
      return;
    }
  }

  copyFileSync(WRANGLER_PATH, `${WRANGLER_PATH}.bak`);
  log(`  backed up -> wrangler.jsonc.bak`);

  let src = readFileSync(WRANGLER_PATH, "utf8");
  src = patchKvId(src, "KV", kvId);
  src = patchKvId(src, "OAUTH_KV", oauthKvId);
  src = patchD1Id(src, d1Id);
  if (usePostgres) {
    src = uncommentHyperdrive(src);
    if (hyperdriveId) src = patchHyperdriveId(src, hyperdriveId);
  } else {
    src = commentOutHyperdrive(src);
  }
  if (values["worker-name"]) src = patchWorkerName(src, values["worker-name"]);
  writeFileSync(WRANGLER_PATH, src);
  log(`  wrote wrangler.jsonc`);

  step("Next steps (not automated — you run these)");
  const put = (n) => `  pnpm exec wrangler secret put ${n}`;
  log("1) Set Worker secrets:");
  if (usePostgres) log(`${put("DATABASE_PROVIDER")}      # value: postgres`);
  log(put("DATAFORSEO_API_KEY"));
  log(
    put("TEAM_DOMAIN") +
      "            # e.g. https://your-team.cloudflareaccess.com",
  );
  log(put("POLICY_AUD") + "             # from Cloudflare Access app");
  if (usePostgres) {
    log("\n2) Run Postgres migrations from your machine (direct connection):");
    log('   POSTGRES_DATABASE_URL="postgres://..." pnpm run db:migrate:pg');
  } else {
    log("\n2) Run D1 migrations:");
    log("   pnpm run db:migrate:prod");
  }
  log("\n3) In the Cloudflare Workers Builds settings for this Worker:");
  log(
    "   Build variable:  NODE_OPTIONS = --max-old-space-size=4096   (fixes the OOM)",
  );
  log("   Build command:   pnpm run build");
  log(
    usePostgres
      ? "   Deploy command:  npx wrangler deploy        (Postgres migrations ran in step 2)"
      : "   Deploy command:  npm run deploy              (runs D1 migrations + build + deploy)",
  );
  log("   Version command: npx wrangler versions upload");
  log(
    "\n4) Enable Cloudflare Access on the Worker route, then push to deploy.",
  );
  log(
    "\nReview `git diff wrangler.jsonc` before committing. Backup at wrangler.jsonc.bak.",
  );
  rl?.close();
}

main().catch((e) => die(e?.stack || String(e)));
