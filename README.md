# FlyRocketSEO

A private, self-hosted SEO research and reporting tool for one team. It runs on
Cloudflare Workers with D1, R2 and KV, and pulls paid SEO data from DataForSEO
on this team's own API key.

Live at `https://flyrocketseo.huy1999nguyen.workers.dev`. Access is restricted to
an email allow-list plus invited teammates; the allow-list fails closed, so an
address that is not on it and holds no invite cannot sign in.

## Table of Contents

- [What it does](#what-it-does)
- [Spending](#spending)
- [Setup](#setup)
- [Deploying](#deploying)
- [Local development](#local-development)
- [MCP and agent skills](#mcp-and-agent-skills)
- [DataForSEO cost reference](#dataforseo-cost-reference)

## What it does

**Research** — keyword research and trends, SERP overview, content optimizer,
page explorer, topic clusters, domain overview, competitors, backlinks, AI
visibility, prompt explorer, local SEO.

**Your own site** — SEO opportunities (a ranked action plan), Google Search
Console insights, link opportunities, cannibalization, local rank grid, rank
tracking, saved keywords, site audit, on-page fixes, and a print-ready client
report.

Each project maps to one domain. Analyses are recorded per project, so a tab you
have run before reopens showing that result instead of a blank form.

## Spending

There is no subscription, no plan tiers and no credit balance. Paid lookups go
straight to DataForSEO on this account's key, at DataForSEO's rates.

**Nothing metered ever runs on its own.** Every paid lookup happens because
someone clicked a control that said it would spend, and the app shows the cost
before it runs. Re-opening a past analysis restores the stored result from R2
and never re-spends. Google Search Console data is free.

## Setup

Secrets are set with `npx wrangler secret put <NAME>` from this directory, or in
the Cloudflare dashboard under the Worker's Variables & Secrets.

| Secret                  | Required | What it unlocks                                     |
| ----------------------- | -------- | --------------------------------------------------- |
| `DATAFORSEO_API_KEY`    | yes      | All paid SEO data                                   |
| `HOSTED_ALLOWED_EMAILS` | yes      | Comma-separated sign-in allow-list                  |
| `GOOGLE_CLIENT_ID`      | for GSC  | Google sign-in and Search Console                   |
| `GOOGLE_CLIENT_SECRET`  | for GSC  | Google sign-in and Search Console                   |
| `OPENROUTER_API_KEY`    | optional | SAM, the onboarding chat, and one-click AI rewrites |

Without `OPENROUTER_API_KEY` every SEO feature still works — only the three AI
features above are unavailable. There is an in-app guide at
`/help/openrouter-api-key`.

For Google Search Console, see
[`docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`](./docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).

## Deploying

```bash
npm run deploy
```

Run `npm run ci:check` first — CI enforces it on push to `main`. Database
migrations live in `drizzle/` and are applied with
`npx wrangler d1 migrations apply DB --remote`.

The Cloudflare account is on the **free plan**, which has a fixed CPU ceiling per
invocation. That is why site-audit crawls run in small batches with a DataForSEO
fallback, and why the run-all button on the dashboard issues one request per
analysis instead of looping server-side.

Deployment details: [`docs/SELF_HOSTING_CLOUDFLARE.md`](./docs/SELF_HOSTING_CLOUDFLARE.md).
Auth modes: [`docs/DEPLOY_INTERNET_FACING.md`](./docs/DEPLOY_INTERNET_FACING.md).

## Local development

See [`docs/LOCAL_DEVELOPMENT.md`](./docs/LOCAL_DEVELOPMENT.md).

```bash
npm run dev          # vite dev on :3000
npm test             # vitest
npm run ci:check     # prettier + knip + tsc + oxlint
```

## MCP and agent skills

The app exposes an MCP server so AI clients can call its tools:

```txt
https://flyrocketseo.huy1999nguyen.workers.dev/mcp
```

The first connection sends you through login and authorization. Agent skills for
SEO workflows live in `.agents/skills/` and can be installed with
`npx skills add ThinkingSpade/FlyRocketSeo`. The in-app **AI & MCP** page has
copy-paste commands for Claude Code, Claude Desktop, Cursor and Codex.

## DataForSEO cost reference

Rough planning figures for DataForSEO spend:

- Track 100 keywords weekly at depth 50: `~$1.20/month`
- 100 keyword research requests at the default 150 results: `$3.50`
- 100 keyword research requests at 500 results each: `$7.00`
- 100 domain overviews (200 ranked keywords each): `$4.01`
- 100 backlinks domain searches at current defaults: about `$6.34`
- 100 backlinks page searches at current defaults: about `$4.30`
- 100 fully explored backlinks domain searches: about `$10.94`
- 100 fully explored backlinks page searches: about `$8.61`

Sources:

- SERP API: https://dataforseo.com/apis/serp-api/pricing
- Keywords Data / Labs: https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api
- Backlinks: https://dataforseo.com/pricing/backlinks/backlinks
- Lighthouse: https://docs.dataforseo.com/v3/on_page/lighthouse/overview/

---

Built on the open-source project this was forked from, with substantial changes
for this deployment.
