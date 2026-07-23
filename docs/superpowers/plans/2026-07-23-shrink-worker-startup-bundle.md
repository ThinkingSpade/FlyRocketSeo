# Shrink the SSR Worker Startup Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the SSR Worker's cold-start blank-screen by moving heavy backend SDKs out of the startup module graph so a cold isolate parses far less JavaScript before it can render.

**Architecture:** The server entry statically links every server function and its service graph, so backend SDKs that only serve metered/AI/MCP requests are parsed on every cold isolate — even to return a 404. We introduce **dynamic-import boundaries** so those SDKs become on-demand chunks loaded on first use, not at startup. On Cloudflare Workers a statically-linked chunk is parsed at isolate creation; only a dynamic `import()` defers that parse. A committed measurement harness proves each phase and guards against regression.

**Tech Stack:** TypeScript, Vite 7 / Rollup, `@cloudflare/vite-plugin`, TanStack Start (SSR), Cloudflare Workers (free plan), Vitest, esbuild minify.

## Baseline (measured 2026-07-23, `main`)

- Static asset TTFB 33 ms; **SSR document TTFB ~4.5–5 s**; DOM interactive +87 ms after first byte; a 404 is also ~4.8 s (cost is **before** routing).
- SSR startup chunk (`dist/server/assets/index-*.js`): **6,075 KB** minified.
- Attribution of that chunk (top): `dataforseo-client` **1,645 KB**, `agents` 311, `zod` 299, `better-auth` 280, `autumn-js` 276, `@cloudflare/think` 211, `react-dom` 197, `kysely` 176, `drizzle-orm` 127, `@modelcontextprotocol/sdk` 109, `ai`+`@ai-sdk/*`+`@openrouter/ai-sdk-provider`+`workers-ai-provider` ≈ 360, `@cloudflare/ai-chat` 66.
- **Measured ceiling:** externalizing the backend SDKs drops the startup chunk to **2,996 KB (−51%)**. This plan realizes that as lazy-loading.

## Global Constraints

- Test runner is **Vitest**. Unit tests live beside the module as `<name>.test.ts`.
- Full gate before any "done" claim: `npm run ci:check` (prettier + knip + tsc + oxlint) and `npm run test`. Both clean.
- **Behaviour must not change.** These are load-time refactors only: same request results, same billing/metering, same auth. Every touched feature's existing tests must still pass unchanged.
- **A dynamic `import()` is the only thing that removes a module from the startup parse.** `manualChunks` does not — a statically-linked chunk is still parsed at isolate startup. Every boundary in this plan is a real `import()`.
- **`knip` fails on unused exports.** If a refactor orphans an export, delete it in the same task.
- Comments explain _why_, not _what_, matching surrounding density. No comment restates its code.
- Do not change `database_name`/`bucket_name` in `wrangler.jsonc`, or the `minify: "esbuild"` / `placement: smart` settings — all load-bearing.
- The build has no `DATAFORSEO_API_KEY` requirement; builds run offline. Commit after each task. Do not push.
- Branch: `perf/shrink-worker-startup-bundle` off `main` (already created).

## Task dependencies

```
0 (harness) ──► 1 (dataforseo) ──► 2 (AI providers) ──► 3 (MCP) ──► 4 (deploy + measure TTFB)
```

Strictly sequential: each phase's guard extends the harness from Phase 0, and each builds on a smaller startup chunk. Phases 1–3 are independently shippable — each is a real TTFB win on its own, so they may merge separately.

## File structure

- `scripts/measure-startup-bundle.mjs` (new) — reads a sourcemap build and reports the startup chunk size + per-package attribution, and asserts named packages are absent. The **development** phase guard (accurate, needs sourcemaps).
- `scripts/attribute-bundle.mjs` (new) — the VLQ sourcemap→bytes attributor, imported by the measure script. (Ported from the investigation scratchpad.)
- `scripts/assert-startup-clean.mjs` (new, Phase 4) — signature-scan guard over the minified `dist` chunk, no sourcemap needed. The **deploy** guard.
- `package.json` — add `perf:startup` (sourcemap build + measure) and `perf:guard` scripts.
- `src/server/lib/dataforseo/client.ts` — Phase 1: leaf `fetch*` imports become per-method dynamic imports.
- 5 standalone-helper consumers — Phase 1: dynamic-import the barrel helpers.
- `src/server/features/sam/SamChatAgent.ts`, `.../onboarding/OnboardingChatAgent.ts`, `src/server/lib/openrouter.ts` — Phase 2: model/tool builders load at request time.
- `src/server/mcp/oauth-provider.ts`, `src/server.ts` — Phase 3: MCP transport dispatched via dynamic import.

---

### Task 0: Measurement + regression harness

The failing "test" for every later phase. It must exist and report the true baseline before any code moves.

**Files:**

- Create: `scripts/attribute-bundle.mjs`
- Create: `scripts/measure-startup-bundle.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**

- Produces: `npm run perf:startup` — runs a sourcemap SSR build then prints the biggest server chunk's size and top-30 contributors.
- Produces: `node scripts/measure-startup-bundle.mjs --assert-absent <pkg,pkg>` — exits non-zero if any named npm package has more than `20 KB` attributed inside the startup chunk, or if the chunk exceeds `--max-kb <n>`.

- [ ] **Step 1: Port the attributor**

Create `scripts/attribute-bundle.mjs` with the VLQ-decoding sourcemap attributor (sums generated bytes per `node_modules/<pkg>` or `src/<area>`). Export a function:

```js
// scripts/attribute-bundle.mjs
import fs from "node:fs";
export function attribute(mapPath) {
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const jsPath = mapPath.replace(/\.map$/, "");
  const genLines = fs.readFileSync(jsPath, "utf8").split("\n");
  const B64 =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const b64 = new Map([...B64].map((c, i) => [c, i]));
  const decode = (str) => {
    const out = [];
    let i = 0;
    while (i < str.length) {
      let r = 0,
        s = 0,
        c;
      do {
        const d = b64.get(str[i++]);
        c = d & 32;
        r += (d & 31) << s;
        s += 5;
      } while (c);
      out.push(r & 1 ? -(r >> 1) : r >> 1);
    }
    return out;
  };
  const group = (src) => {
    if (!src) return "(unmapped)";
    const s = src.replace(/\\/g, "/");
    const nm = s.lastIndexOf("node_modules/");
    if (nm !== -1) {
      const r = s.slice(nm + 13).split("/");
      return "npm:" + (r[0].startsWith("@") ? r[0] + "/" + r[1] : r[0]);
    }
    const si = s.indexOf("src/");
    return si !== -1
      ? s.slice(si).split("/").slice(0, 4).join("/")
      : s.split("/").slice(-2).join("/");
  };
  const bytes = new Array(map.sources.length).fill(0);
  let srcIdx = 0;
  map.mappings.split(";").forEach((line, ln) => {
    let genCol = 0;
    const segs = line.length ? line.split(",").map(decode) : [];
    const eol = (genLines[ln] ?? "").length;
    segs.forEach((seg, k) => {
      const gc = genCol + seg[0];
      if (seg.length >= 4) srcIdx += seg[1];
      const next = k + 1 < segs.length ? gc + segs[k + 1][0] : eol;
      if (seg.length >= 4 && srcIdx >= 0 && srcIdx < bytes.length)
        bytes[srcIdx] += Math.max(0, next - gc);
      genCol = gc;
    });
  });
  const totals = new Map();
  bytes.forEach((b, i) => {
    const g = group(map.sources[i]);
    totals.set(g, (totals.get(g) ?? 0) + b);
  });
  const totalGen = genLines.reduce((n, l) => n + l.length + 1, 0);
  return {
    totalKb: Math.round(totalGen / 1024),
    ranked: [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, b]) => [name, Math.round(b / 1024)]),
  };
}
```

- [ ] **Step 2: Write the measure/guard CLI**

Create `scripts/measure-startup-bundle.mjs`:

```js
// scripts/measure-startup-bundle.mjs
// Reads a sourcemap SSR build (dist-sourcemaps/server/assets), reports the
// biggest chunk's composition, and optionally asserts packages are absent.
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
const biggest = jsFiles
  .map((f) => [f, fs.statSync(path.join(dir, f)).size])
  .sort((a, b) => b[1] - a[1])[0];
const [file, size] = biggest;
const { totalKb, ranked } = attribute(path.join(dir, file + ".map"));
console.log(`startup chunk: ${file}  ${Math.round(size / 1024)} KB`);
console.log("top contributors (KB):");
for (const [name, kb] of ranked.slice(0, 30))
  console.log(`  ${String(kb).padStart(6)}  ${name}`);

const args = process.argv.slice(2);
const absentArg = args[args.indexOf("--assert-absent") + 1];
const maxKbArg =
  args.indexOf("--max-kb") !== -1
    ? Number(args[args.indexOf("--max-kb") + 1])
    : null;
let failed = false;
if (args.includes("--assert-absent") && absentArg) {
  const banned = absentArg.split(",");
  const THRESHOLD_KB = 20; // small residue (types, re-exports) is fine; real runtime is not
  for (const pkg of banned) {
    const hit = ranked.find(([name]) => name === `npm:${pkg}`);
    if (hit && hit[1] > THRESHOLD_KB) {
      console.error(
        `FAIL: ${pkg} contributes ${hit[1]} KB to the startup chunk (want ≤ ${THRESHOLD_KB}).`,
      );
      failed = true;
    }
  }
}
if (maxKbArg && Math.round(size / 1024) > maxKbArg) {
  console.error(
    `FAIL: startup chunk ${Math.round(size / 1024)} KB exceeds --max-kb ${maxKbArg}.`,
  );
  failed = true;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Add npm scripts**

In `package.json` scripts:

```json
"perf:startup": "rm -rf dist-sourcemaps && AUTH_MODE=hosted POSTHOG_SOURCEMAPS=true node scripts/build.mjs && node scripts/measure-startup-bundle.mjs",
"perf:guard": "node scripts/measure-startup-bundle.mjs"
```

(`build.mjs` already sets the heap ceiling and forces `AUTH_MODE=hosted`; `POSTHOG_SOURCEMAPS=true` makes it emit `.map` files to `dist-sourcemaps`.)

- [ ] **Step 4: Run it — capture the baseline**

Run: `npm run perf:startup`
Expected: prints `startup chunk: index-*.js  ~6075 KB` and a top-contributors list led by `npm:dataforseo-client ~1645`. This is the baseline every phase is measured against.

- [ ] **Step 5: Prove the guard fails on the baseline (the failing test)**

Run: `node scripts/measure-startup-bundle.mjs --assert-absent dataforseo-client`
Expected: `FAIL: dataforseo-client contributes ~1645 KB…` and exit code 1. This is the red test Phase 1 turns green.

- [ ] **Step 6: Commit**

```bash
git add scripts/attribute-bundle.mjs scripts/measure-startup-bundle.mjs package.json
git commit -m "Add a startup-bundle measurement + regression guard"
```

---

### Task 1: Lazy-load the DataForSEO SDK (1.6 MB)

The single biggest win. `createDataforseoClient` synchronously wires ~40 methods to leaf `fetch*` functions, each of which imports the 1.6 MB `dataforseo-client` SDK — so the whole SDK links into startup. We keep the factory **synchronous** (callers already `await` the methods) and make each method import its leaf module on call. The five helpers that bypass the factory get the same treatment.

> **Scope correction from execution (the plan under-estimated this).** Converting `client.ts` + the helper consumers moved the number by ~0. The SDK does **not** tree-shake, so _any_ static import of _any_ SDK-carrying leaf pulls the whole 1.6 MB, and the dominant path was **the barrel re-exporting SDK-carrying fetchers** (`fetchKeywordMetricsForList` from `keyword-metrics`, `fetchRankCheckTaskResult` from `serp`): ~100 modules import `createDataforseoClient` from the barrel, and each dragged the leaves in. The full fix was: (1) `client.ts` lazy via a `fetchers.ts` barrel dynamically imported; (2) convert the ~7 runtime consumers to dynamic leaf imports; (3) **remove the two SDK-carrying fetcher re-exports from the barrel**, repointing their consumers at the leaf modules; (4) relocate the lightweight helpers co-located in SDK files (`normalizeBacklinksTarget`, `CHATGPT_*`, `buildLlmTarget`, `MAX_TASKS_PER_POST`) into SDK-free companion modules so their static importers stop pulling the SDK. Result: startup chunk **5,933 → 4,246 KB**, `dataforseo-client` absent. Test note: `client.test.ts` must mock **every** leaf `fetchers.ts` re-exports (it missed `google-ads`), or the client's lazy `import()` loads the real SDK and the test flakes under parallel load.

**Files:**

- Modify: `src/server/lib/dataforseo/client.ts`
- Modify: `src/server/features/keywords/services/research/refresh-metrics.ts`
- Modify: `src/server/features/local-seo/services/LocalSeoService.ts`
- Modify: `src/server/features/rank-tracking/services/RankTrackingService.ts`
- Modify: `src/server/mcp/tools/dataforseo-research-tools.ts`
- Modify: `src/server/workflows/rankCheckPaths.ts`

**Interfaces:**

- Consumes: the Phase 0 guard.
- Produces: `createDataforseoClient(customer)` unchanged signature and return shape (sync factory → object of async methods). Standalone helpers `fetchKeywordMetricsForList`, `fetchRankCheckTaskResult`, `fetchGoogleReviewsResult`, `MAX_TASKS_PER_POST` become reachable only via dynamic import from their consumers.

- [ ] **Step 1: Verify the red guard**

Run: `node scripts/measure-startup-bundle.mjs --assert-absent dataforseo-client`
Expected: FAIL (exit 1), ~1645 KB. (If Phase 0's build is stale, run `npm run perf:startup` first.)

- [ ] **Step 2: Convert `client.ts` methods to per-method dynamic import**

Replace the static leaf imports at the top of `client.ts` with dynamic imports inside a `lazyMeter` helper. The current `meter(customer, fetchX, feature)` takes the fetcher eagerly; add a sibling that takes a loader:

```ts
// Loads the leaf fetcher on first call, so its dataforseo-client imports form
// an on-demand chunk instead of startup weight. Same metering, same result.
function lazyMeter<I, T>(
  customer: BillingCustomerContext,
  load: () => Promise<(input: I) => Promise<DataforseoApiResponse<T>>>,
  defaultFeature?: CreditFeature,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      async () => (await load())(input),
      input.creditFeature ?? defaultFeature,
    );
}
```

Then delete the top-level `import { fetch* } from "./labs"` (and the other leaf modules) and rewrite each factory entry, e.g.:

```ts
    keywords: {
      related: lazyMeter(customer, () => import("./labs").then((m) => m.fetchRelatedKeywords)),
      suggestions: lazyMeter(customer, () => import("./labs").then((m) => m.fetchKeywordSuggestions)),
      ideas: lazyMeter(customer, () => import("./labs").then((m) => m.fetchKeywordIdeas)),
      // …one line per method, importing from the leaf that defines it.
    },
```

Keep any **type-only** imports from the leaf modules as `import type` (erased at build, so they don't relink). Leave `meter` in place for anything that genuinely must stay eager (nothing should).

- [ ] **Step 3: Convert the five standalone-helper consumers**

Each currently does `import { fetchKeywordMetricsForList } from "@/server/lib/dataforseo"` at module top and calls it inside an async function. Move the import into the call site. Example for `refresh-metrics.ts`:

```ts
// was: import { fetchKeywordMetricsForList } from "@/server/lib/dataforseo";
// inside the async function that uses it:
const { fetchKeywordMetricsForList } = await import("@/server/lib/dataforseo");
const rows = await fetchKeywordMetricsForList(/* …unchanged args… */);
```

Do the same for `fetchRankCheckTaskResult` / `MAX_TASKS_PER_POST` in `RankTrackingService.ts` and `rankCheckPaths.ts`, `fetchKeywordMetricsForList` in `LocalSeoService.ts` and `dataforseo-research-tools.ts`. Keep `import type` for any types they pull from the barrel. `MAX_TASKS_PER_POST` is a const — read it from the same dynamic import inside the function that batches tasks.

- [ ] **Step 4: Behaviour tests still pass**

Run: `npm run test`
Expected: unchanged pass count. The DataForSEO wrapper's own tests (`src/server/lib/dataforseo/*.test.ts`) and every feature test that exercises a metered path must pass without edits. If a test imported a leaf `fetch*` from the barrel at module top and that now fails typing, switch it to `import type` or a dynamic import — do not change what it asserts.

- [ ] **Step 5: Rebuild and turn the guard green**

Run: `npm run perf:startup && node scripts/measure-startup-bundle.mjs --assert-absent dataforseo-client --max-kb 4600`
Expected: PASS (exit 0). `dataforseo-client` no longer appears (or ≤ 20 KB), and the startup chunk drops from ~6075 KB to roughly **~4400 KB**. Record the printed number.

- [ ] **Step 6: Full gate**

Run: `npm run ci:check && npm run test`
Expected: clean. Watch for a `knip` error if the barrel now has an unused export; if so, delete it.

- [ ] **Step 7: Commit**

```bash
git add src/server/lib/dataforseo/client.ts src/server/features/keywords/services/research/refresh-metrics.ts src/server/features/local-seo/services/LocalSeoService.ts src/server/features/rank-tracking/services/RankTrackingService.ts src/server/mcp/tools/dataforseo-research-tools.ts src/server/workflows/rankCheckPaths.ts
git commit -m "Lazy-load the DataForSEO SDK out of the Worker startup graph"
```

---

### Task 2: Lazy-load the AI provider SDKs (~360 KB)

`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@openrouter/ai-sdk-provider`, and `workers-ai-provider` are pulled in because the chat DO classes and their helpers import the model/tool builders at module top. The DO **classes** must stay statically exported (Cloudflare resolves them as named exports) and extend framework base classes (`@cloudflare/ai-chat`'s `AIChatAgent`, `@cloudflare/think`'s `Think`) that cannot be lazy-loaded — **so those base frameworks (`agents`, `@cloudflare/think`, `@cloudflare/ai-chat`, ~590 KB) stay in startup for now and are out of scope for this task.** What we can defer is the AI _provider_ SDKs, which are only touched at request time when a model is actually built.

**Files:**

- Modify: `src/server/lib/openrouter.ts` (the model builders `buildChatAgentModel` / `getChatAgentModel`)
- Modify: `src/server/features/sam/SamChatAgent.ts`
- Modify: `src/server/features/onboarding/OnboardingChatAgent.ts`

**Interfaces:**

- Consumes: the Phase 0 guard.
- Produces: `getChatAgentModel` / `buildChatAgentModel` become `async` (they already run inside async message handlers), returning the same model object via a dynamic import of the provider SDK.

- [ ] **Step 1: Confirm the provider SDKs are in startup**

Run: `npm run perf:startup && node scripts/measure-startup-bundle.mjs --assert-absent @ai-sdk/openai,@openrouter/ai-sdk-provider`
Expected: FAIL — both present (~98 KB + ~78 KB).

- [ ] **Step 2: Make the model builders load the provider on call**

In `src/server/lib/openrouter.ts`, change the top-level `import { createOpenRouter } from "@openrouter/ai-sdk-provider"` (and any `@ai-sdk/*` / `ai` runtime imports) to dynamic imports inside the (now `async`) builder:

```ts
export async function buildChatAgentModel(/* …unchanged args… */) {
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  // …unchanged body using createOpenRouter…
}
```

Keep `import type` for any `ai` types (e.g. `LanguageModel`). Apply the same to `getChatAgentModel`.

- [ ] **Step 3: `await` the builders at their call sites**

In `SamChatAgent.ts` and `OnboardingChatAgent.ts`, the builder calls are already inside `async onChatMessage`/handlers; add `await`:

```ts
const model = await buildChatAgentModel(/* … */);
```

Update any other callers the compiler flags (`tsc` will list them). Keep the tool builders (`buildSamMcpTools`, `buildOnboardingTools`) dynamic too if they statically pull an AI SDK; otherwise leave them.

- [ ] **Step 4: Behaviour tests pass**

Run: `npm run test`
Expected: unchanged. SAM/onboarding chat tests must pass without assertion changes.

- [ ] **Step 5: Rebuild and guard**

Run: `npm run perf:startup && node scripts/measure-startup-bundle.mjs --assert-absent @ai-sdk/openai,@ai-sdk/anthropic,@openrouter/ai-sdk-provider,workers-ai-provider --max-kb 4300`
Expected: PASS. The provider SDKs leave the startup chunk (a further ~300–360 KB). `agents`/`@cloudflare/think`/`@cloudflare/ai-chat` are still present — expected, documented above.

- [ ] **Step 6: Full gate and commit**

Run: `npm run ci:check && npm run test`

```bash
git add src/server/lib/openrouter.ts src/server/features/sam/SamChatAgent.ts src/server/features/onboarding/OnboardingChatAgent.ts
git commit -m "Lazy-load the AI provider SDKs out of the Worker startup graph"
```

---

### Task 3: Lazy-load the MCP transport (~185 KB)

`@modelcontextprotocol/sdk` (109 KB) + `src/server/mcp/tools` (76 KB) are in startup because `src/server/mcp/oauth-provider.ts` statically imports `handleAuthenticatedFlyRocketSeoMcpRequest` from `@/server/mcp/transport`, and the OAuth provider wraps **every** hosted request. The MCP transport is only needed when an MCP request is actually dispatched. Defer it with a dynamic import at the dispatch point, in both the hosted (OAuth provider) and self-hosted (`server.ts`) paths.

**Files:**

- Modify: `src/server/mcp/oauth-provider.ts`
- Modify: `src/server.ts` (the `handleSelfHostedFlyRocketSeoMcpRequest` dispatch)

**Interfaces:**

- Consumes: the Phase 0 guard.
- Produces: MCP request handlers invoked via `await import("@/server/mcp/transport")` at their dispatch sites; the OAuth provider no longer links the transport statically.

- [ ] **Step 1: Confirm MCP is in startup**

Run: `npm run perf:startup && node scripts/measure-startup-bundle.mjs --assert-absent @modelcontextprotocol/sdk`
Expected: FAIL — present (~109 KB), plus `src/server/mcp/tools` in the `src/` rows.

- [ ] **Step 2: Dispatch the hosted MCP handler dynamically**

In `oauth-provider.ts`, remove the top-level `import { handleAuthenticatedFlyRocketSeoMcpRequest } from "@/server/mcp/transport"`. At the point the provider routes an MCP request, load it on demand:

```ts
// where it currently calls handleAuthenticatedFlyRocketSeoMcpRequest(...):
const { handleAuthenticatedFlyRocketSeoMcpRequest } =
  await import("@/server/mcp/transport");
return handleAuthenticatedFlyRocketSeoMcpRequest(/* …unchanged args… */);
```

Ensure the enclosing function is `async` (the provider's fetch handler already returns a `Promise`). Keep `import type` for any transport types.

- [ ] **Step 3: Dispatch the self-hosted MCP handler dynamically**

In `src/server.ts`, the self-hosted branch calls `handleSelfHostedFlyRocketSeoMcpRequest` for `pathname === MCP_ROUTE`. Replace its top-level import with a dynamic import inside that branch:

```ts
if (
  (authMode === "cloudflare_access" || authMode === "local_noauth") &&
  pathname === MCP_ROUTE
) {
  const { handleSelfHostedFlyRocketSeoMcpRequest } =
    await import("@/server/mcp/transport");
  return handleSelfHostedFlyRocketSeoMcpRequest(
    publicRequest,
    authMode,
    env,
    ctx,
  );
}
```

`handleFetch` returns `Response | Promise<Response>` already, so returning a promise from this branch is fine. Confirm no other startup-graph module statically imports from `@/server/mcp/transport` or `@/server/mcp/tools` (grep; convert any stragglers).

- [ ] **Step 4: Behaviour tests pass**

Run: `npm run test`
Expected: unchanged. MCP tool/output tests (`src/server/mcp/**/*.test.ts`) pass without assertion edits.

- [ ] **Step 5: Rebuild and guard**

Run: `npm run perf:startup && node scripts/measure-startup-bundle.mjs --assert-absent @modelcontextprotocol/sdk --max-kb 4100`
Expected: PASS. MCP SDK + tools leave startup.

- [ ] **Step 6: Full gate and commit**

Run: `npm run ci:check && npm run test`

```bash
git add src/server/mcp/oauth-provider.ts src/server.ts
git commit -m "Lazy-load the MCP transport out of the Worker startup graph"
```

---

### Task 4: Deploy and measure the real cold-start improvement

Bundle size is a proxy; the acceptance criterion is TTFB on the deployed free-plan Worker. This task confirms the seconds, and wires the guard into the deploy path so the win can't silently regress.

**Files:**

- Modify: `package.json` (fold the guard into the deploy pre-step)

**Interfaces:**

- Consumes: Tasks 1–3.

- [ ] **Step 1: Full production build, record the startup chunk**

Run: `npm run perf:startup`
Expected: startup chunk ≈ **3,000–3,300 KB** (down from 6,075). Record the number.

- [ ] **Step 2: Deploy**

Run: `npm run deploy`
Expected: `wrangler deploy` succeeds and passes the free-plan startup-CPU validation (it had headroom before; a smaller bundle has more).

- [ ] **Step 3: Measure cold-start TTFB on production**

From a browser console on `https://flyrocketseo.huy1999nguyen.workers.dev`, run the same probe used in diagnosis (fetch `/` and a static asset with `cache: no-store`, compare). Do it after a few minutes idle to force a cold isolate.
Expected: SSR document TTFB materially below the ~4.5 s baseline. Record before/after. (Parse cost roughly halved; exact seconds depend on the isolate.)

- [ ] **Step 4: Add a no-sourcemap deploy guard**

`npm run build` writes minified `dist` without sourcemaps, so the attribution guard (which needs `.map` files) can't run there. Add a fast signature-scan guard that greps the biggest `dist/server/assets` chunk for each banned SDK's distinctive runtime string — these survive minification (confirmed in the investigation: `dataforseo` appeared 91×, `openai` 117× in the minified chunk).

Create `scripts/assert-startup-clean.mjs`:

```js
// scripts/assert-startup-clean.mjs
// Fails if a banned SDK's runtime signature is present in the biggest
// minified server chunk (dist/server/assets). No sourcemap needed — for deploy.
import fs from "node:fs";
import path from "node:path";

const dir = "dist/server/assets";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const [file] = files
  .map((f) => [f, fs.statSync(path.join(dir, f)).size])
  .sort((a, b) => b[1] - a[1])[0];
const code = fs.readFileSync(path.join(dir, file), "utf8");

// A distinctive runtime string per banned package (not the package name, which
// may be tree-shaken away — a string literal the SDK actually ships).
const SIGNATURES = {
  "dataforseo-client": "api.dataforseo.com",
  "@ai-sdk": "@ai-sdk/",
  "@openrouter/ai-sdk-provider": "openrouter.ai",
  "@modelcontextprotocol/sdk": "modelcontextprotocol",
};
let failed = false;
for (const [pkg, sig] of Object.entries(SIGNATURES)) {
  if (code.includes(sig)) {
    console.error(`FAIL: "${sig}" (${pkg}) is in the startup chunk ${file}.`);
    failed = true;
  }
}
if (!failed)
  console.log(`startup chunk ${file} clean of banned SDK signatures.`);
process.exit(failed ? 1 : 0);
```

Verify each signature really appears in the _baseline_ build before trusting the guard: check out `main`, `npm run build`, `node scripts/assert-startup-clean.mjs`, and confirm it FAILS on all four (proving the signatures are detectable). Return to the branch afterward.

Then wire it into deploy:

```json
"deploy": "npm run db:migrate:prod && npm run build && node scripts/assert-startup-clean.mjs && wrangler deploy"
```

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/assert-startup-clean.mjs
git commit -m "Guard the deploy against a heavy SDK re-entering the startup bundle"
```

---

## What this plan does not do (scope boundaries)

- **Does not touch `agents` / `@cloudflare/think` / `@cloudflare/ai-chat` (~590 KB).** They are base classes of statically-exported Durable Objects; deferring them needs a DO-shell indirection that risks the chat lifecycle. Worth a separate spike later — estimated another ~500 KB off startup.
- **Does not touch `zod`, `better-auth`, `react-dom`, `drizzle-orm`, `kysely`.** These are genuinely needed to render/authenticate/serve on the hot path.
- **Does not change the Cloudflare plan.** Upgrading to Paid reduces cold-start _frequency_ and is complementary, but is the user's billing decision, not a code change.
- **Does not add route-component code-splitting.** Partial splitting already exists; the startup weight is the server-function SDK graph, which this plan targets directly.

## Verification before claiming done

- [ ] `npm run ci:check` and `npm run test` clean after every phase.
- [ ] `npm run perf:startup` shows the startup chunk ≤ ~3,300 KB.
- [ ] The deploy guard fails if any of the four banned SDKs re-enters startup.
- [ ] Production cold-start TTFB recorded before (~4.5 s) and after, materially lower.
- [ ] No behaviour change: metered results, billing, auth, chat, and MCP all still work — existing tests unchanged.
