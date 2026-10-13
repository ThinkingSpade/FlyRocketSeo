/** Route-control contract with explicit doubles, not authenticated E2E. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = ts.transpileModule(
  readFileSync(
    resolve(root, "src/routes/_project/p/$projectId/route.tsx"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

function render(code) {
  const redirects = [],
    remembered = [],
    retries = [];
  const query = {
    error: code ? { code } : null,
    isError: !!code,
    isSuccess: !code,
    isFetching: false,
    refetch: () => retries.push(true),
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    "@tanstack/react-router": {
      Outlet: "Outlet",
      createFileRoute: () => (options) => ({
        ...options,
        useParams: () => ({ projectId: "project-a" }),
      }),
      useLocation: () => false,
      useNavigate: () => (value) => redirects.push(value),
    },
    "@tanstack/react-query": { useQuery: () => query },
    react: { useEffect: (fn) => fn() },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/client/lib/active-project": {
      setLastProjectId: (value) => remembered.push(value),
    },
    "@/client/features/auth/useHostedAuthRouteGuard": {
      useHostedAuthRouteGuard: () => ({
        canRenderAuthenticatedContent: true,
        isHostedMode: false,
      }),
    },
    "@/client/components/LoadingShell": { LoadingShell: "LoadingShell" },
    "@/client/components/InlineQueryError": {
      InlineQueryError: "InlineQueryError",
    },
    "@/client/features/billing/FreePlanBanner": {
      FreePlanBanner: "FreePlanBanner",
    },
    "@/client/features/onboarding/useOnboardingRedirect": {
      useOnboardingRedirect: () => {},
    },
    "@/client/lib/error-messages": { getErrorCode: (error) => error.code },
    "@/client/layout/AppShell": { AuthenticatedAppLayout: "AppLayout" },
    "@/lib/auth-redirect": {
      getCurrentAuthRedirectFromHref: (value) => value,
      getSignInSearch: (redirect) => ({ redirect }),
    },
    "@/serverFunctions/projects": {
      getProjectAccess: () => {
        throw new Error("No server calls allowed");
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}})`, {
    window: { location: { href: "https://fixture.invalid/p/project-a" } },
  })(
    (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected module ${name}`);
      return mocks[name];
    },
    module,
    module.exports,
  );
  return {
    tree: module.exports.Route.component(),
    redirects,
    remembered,
    retries,
  };
}
for (const code of [
  "INTERNAL_ERROR",
  "UPSTREAM_UNAVAILABLE",
  "RATE_LIMITED",
  "network-failure",
]) {
  const result = render(code);
  assert.equal(result.redirects.length, 0, `${code} must not redirect home`);
  assert.equal(
    result.remembered.length,
    0,
    "Unverified projects must not become the landing target",
  );
  const card = result.tree.props.children.props.children;
  assert.equal(card.type, "InlineQueryError");
  card.props.onRetry();
  assert.equal(result.retries.length, 1);
}
for (const code of ["NOT_FOUND", "FORBIDDEN"])
  assert.equal(render(code).redirects[0].to, "/");
assert.equal(render("UNAUTHENTICATED").redirects[0].to, "/sign-in");
assert.equal(render(null).remembered[0], "project-a");
assert.equal(render(null).tree.props.children.type, "Outlet");
console.log(
  "PASS: four retryable errors, forbidden/missing/unauthenticated redirects, success and project memory",
);
