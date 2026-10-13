# UX verification and handoff

Repository: `ThinkingSpade/FlyRocketSeo`. Product branch: `ux/product-quality-2026-10-13`. Date: 2026-10-13.

## Preserved work and accepted baseline

The earlier product audit and reliability repairs remain intact. The shared-UX commit `21b900c310e1b8de951a6c47759b44847cd202f8` introduced navigation/dialog/table accessibility, consistent shell behavior and optional-provider setup recovery. The subsequent code commit `cb43a397a7f3a337c238e2089d25d827a77a0fe6` added the dashboard next-action hierarchy, Overview entry, domain data states, pagination accuracy, viewport-aware tooltips, export recovery and narrow-screen selection layout.

Acceptance run `38443982692` verified that latter code against the locked dependencies. Downloaded logs, JSON results and screenshots were inspected, not just the workflow badge:

<!-- prettier-ignore -->
| Gate | Observed result |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Static checks | Prettier, Knip, TypeScript and type-aware Oxlint completed; zero Oxlint errors/warnings; a non-fatal Knip ignore-dependency hint remains |
| Native tests | 3,266 passed in 330 files |
| Build | Client/server build, root prerender and SPA loading shell passed; large-chunk advisory remains |
| Application browser interactions | 16 passed |
| Captures | 43, including 25 initial project routes; no recorded page-level overflow or capture errors |
| JavaScript exceptions | None captured by the page-error listener |
| Unsuccessful HTTP responses | 37 local-noauth `/api/auth/get-session` 404s; not zero network errors |

## Final corrective review

Screenshot inspection found that geometry and visibility checks did not establish whether a menu item could receive a pointer action. A new real-component browser regression reproduced the selection toolbar covering the CSV option in both 320px and 390px touch configurations. The two mouse configurations passed before the fix; both touch configurations failed on intercepted pointer events. This was not a mock assertion or an intentionally forced click.

The repair sets the bulk export menu's portaled positioner above the toolbar and below modal dialogs. All four configurations then passed actual clicks/taps on both menu items, callback counts, closing behavior and Escape focus restoration. Local tests also reran the baseline's full 3,266-test suite successfully. Final branch verification must include the new component regression in addition to the existing full-application suite.

The six documents in this directory describe actual changes and remaining gaps. Earlier `docs/audits/verification-results.md` describes the earlier reliability stage; this document supplements it rather than retroactively changing that stage's evidence.

## Reproduce without deploying

```sh
pnpm install --frozen-lockfile
pnpm run ci:check
pnpm test
pnpm run build
pnpm exec playwright install --with-deps chromium
node scripts/ux/bulk-actions-browser.mjs
```

The component script accepts `PLAYWRIGHT_EXECUTABLE` and `UX_BULK_EVIDENCE_DIR`. It builds the actual React/Kumo controls with the application stylesheet and blocks all browser network requests. Its screenshot heading explicitly labels it as a component fixture.

For the full application, use an isolated checkout and local database. Set `AUTH_MODE=local_noauth`, `VITE_E2E_DOMAIN_FIXTURES=1`, `VITE_E2E_KEYWORD_FIXTURES=1`, and `VITE_SHOW_DEVTOOLS=false` in the isolated `.env.local`; apply migrations with `wrangler d1 migrations apply DB --local`; start Vite at `127.0.0.1:3101`; then run `AUTH_MODE=local_noauth node scripts/ux/browser-review.mjs`. Never use local-noauth or fixture flags as production configuration. The acceptance workflow supplies this environment without production secrets or a deployment step.

Local container package-host access was unavailable, so dependency and source artifacts were restored offline. The restored source tree exactly matched GitHub tree `6ad8f1b4d064c4af04c1dff07af8a974a87d1a2d`. A local full-app startup failed during Cloudflare runtime initialization; GitHub Actions provides the full-app verification environment. Local component tests do not substitute for that environment.

## Evidence boundaries and release gate

Screenshots establish the captured layouts and disconnected states. They do not establish functioning live Google Search Console, paid SEO data, Google Sheets, production crawling, authentication renewal or account isolation. The 16 browser interactions are specific assertions, not 25 fully tested business workflows. Desktop captures cover all listed routes; only selected routes have a narrow-screen capture, and Domain Overview additionally has five widths.

The scorecard is a scoped reviewer assessment, not user research, certification or a performance benchmark. Independent human/code review remains outstanding. See `remaining-improvements.md` for exact next priorities. Do not merge or deploy merely because the isolated tests pass.
