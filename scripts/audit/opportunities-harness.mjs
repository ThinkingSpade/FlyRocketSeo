/**
 * Offline component-contract harness. This executes the actual TypeScript page
 * and model with explicit query/UI doubles. It is NOT a React, router, provider,
 * Cloudflare, or authenticated end-to-end test. Unknown imports fail closed.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const feature = resolve(root, "src/client/features/opportunities");

export function healthyPage(overrides = {}) {
  return {
    url: "https://fixture.invalid/page",
    statusCode: 200,
    title: "Fixture title",
    metaDescription: "Fixture description",
    h1Count: 1,
    wordCount: 900,
    imagesMissingAlt: 0,
    ...overrides,
  };
}

export function fixture(overrides = {}) {
  const ok = { isError: false, isPending: false, isFetching: false };
  return {
    history: { ...ok, data: [{ id: "audit-a", status: "completed" }] },
    audit: {
      ...ok,
      data: {
        audit: { id: "audit-a", completedAt: "2026-10-10T12:00:00.000Z" },
        pages: [healthyPage()],
      },
    },
    report: {
      ...ok,
      data: {
        connected: true,
        strikingDistance: [],
        ctrOpportunities: [],
        sampling: { queryPages: { truncated: false } },
        range: { startDate: "2026-09-12", endDate: "2026-10-09" },
      },
    },
    links: {
      ...ok,
      data: { connected: true, cannibalization: [], truncated: false },
    },
    ...overrides,
  };
}

export function createHarness(state = fixture()) {
  const calls = { queries: [], retries: [], serverCalls: [] };
  const cache = new Map();
  const node = (type, props = {}) => ({ type, props });
  const jsx = (type, props = {}) =>
    typeof type === "function" ? type(props) : node(type, props);
  const withRetry = (name, value) => ({
    ...value,
    refetch: () => calls.retries.push(name),
  });
  const neverCall = (name) => () => {
    calls.serverCalls.push(name);
    throw new Error(
      `Provider/server function must not run in this harness: ${name}`,
    );
  };
  const Table = Object.assign((props) => node("table", props), {
    Header: "thead",
    Row: "tr",
    Head: "th",
    Body: "tbody",
  });
  const mocks = {
    react: { useMemo: (calculate) => calculate() },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-router": { Link: "Link" },
    "@tanstack/react-query": {
      useQuery: (options) => {
        calls.queries.push(options);
        const name = {
          auditHistory: "history",
          auditResults: "audit",
          searchPerformance: "report",
        }[options.queryKey[0]];
        if (!name) throw new Error(`Unexpected query: ${options.queryKey}`);
        return withRetry(name, state[name]);
      },
    },
    "@/client/features/audit/auditQueryKeys": {
      auditHistoryKey: (project) => ["auditHistory", project],
      auditResultsKey: (project, audit) => ["auditResults", project, audit],
    },
    "@phosphor-icons/react": Object.fromEntries(
      ["ArrowUpRight", "Lightbulb", "Wrench", "ClipboardText"].map((name) => [
        name,
        name,
      ]),
    ),
    "@/client/components/AppCard": { AppCard: "AppCard" },
    "@/client/components/SectionHeader": { SectionHeader: "SectionHeader" },
    "@/client/components/InlineQueryError": {
      InlineQueryError: "InlineQueryError",
    },
    "@/client/components/AppPageShell": { AppPageShell: "AppPageShell" },
    "@/client/components/InsightTile": { InsightTile: "InsightTile" },
    "@/serverFunctions/searchPerformance": {
      getSearchPerformanceReport: neverCall("getSearchPerformanceReport"),
    },
    "@/serverFunctions/audit": {
      getAuditHistory: neverCall("getAuditHistory"),
      getAuditResults: neverCall("getAuditResults"),
    },
    "@/client/features/link-insights/cannibalizationSeverity": {
      scoreCannibalization: (rows) => rows,
    },
    "@/client/features/link-insights/useLinkInsights": {
      useLinkInsights: () => withRetry("links", state.links),
      toPath: (url) => new URL(url).pathname,
    },
    "@/client/features/profiles/ProjectProfileCard": {
      ProjectProfileCard: "ProjectProfileCard",
    },
    "@/client/features/profiles/useProjectProfile": {
      useProjectProfile: () => ({ profile: null }),
      useKeywordFit: () => new Map(),
    },
    "./OpportunityRow": { OpportunityRow: "OpportunityRow" },
    // This controlled harness covers the inherited recommendation cards.
    // Persisted work/auth/storage are exercised by the application acceptance suite.
    "./OpportunityWork": { OpportunityWork: "OpportunityWork" },
    "@cloudflare/kumo/components/badge": { Badge: "Badge" },
    "@cloudflare/kumo/components/loader": { Loader: "Loader" },
    "@cloudflare/kumo/components/button": { buttonVariants: () => "button" },
    "@cloudflare/kumo/components/table": { Table },
  };

  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const file = resolve(feature, name);
    const source = readFileSync(file, "utf8");
    const { outputText, diagnostics = [] } = ts.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    const errors = diagnostics.filter(
      (item) => item.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (path) => path,
          getCurrentDirectory: () => root,
          getNewLine: () => "\n",
        }),
      );
    const module = { exports: {} };
    cache.set(name, module.exports);
    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      const local = {
        "./opportunityModel": "opportunityModel.ts",
        "./OpportunityTiles": "OpportunityTiles.tsx",
        "./technicalAuditState": "technicalAuditState.ts",
        "./technicalIssues": "technicalIssues.ts",
      }[specifier];
      if (local) return load(local);
      throw new Error(`Unmocked import in ${name}: ${specifier}`);
    };
    vm.runInThisContext(
      `(function(require, module, exports) {\n${outputText}\n})`,
      {
        filename: file,
      },
    )(localRequire, module, module.exports);
    return module.exports;
  }
  return {
    calls,
    load,
    render: () =>
      load("OpportunitiesPage.tsx").OpportunitiesPage({
        projectId: "project-a",
      }),
  };
}

export function nodes(tree, type) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return [
    ...(tree.type === type ? [tree] : []),
    ...Object.values(tree.props ?? {}).flatMap((child) => nodes(child, type)),
  ];
}

export function text(tree) {
  if (tree == null || typeof tree === "boolean" || typeof tree === "function")
    return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return Object.values(tree.props ?? {})
    .map(text)
    .join(" ");
}

export function tile(tree, label) {
  const match = nodes(tree, "InsightTile").find(
    (item) => item.props.label === label,
  );
  if (!match) throw new Error(`Tile not found: ${label}`);
  return match.props;
}
