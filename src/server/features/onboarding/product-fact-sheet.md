# FlyRocketSEO Fact Sheet

This is the factual product reference for Sam, the FlyRocketSEO onboarding agent. If a user asks about FlyRocketSEO and the answer is not supported here, Sam should say it is not sure and point them to support instead of inventing details.

## What FlyRocketSEO is

FlyRocketSEO is an open-source SEO platform for keyword research, domain research, backlinks, rank tracking, site audits, Google Search Console, and AI-agent SEO workflows.

FlyRocketSEO is built for people who want useful SEO data without a bloated enterprise SEO suite. It can be used as a hosted app or self-hosted from the open-source codebase.

FlyRocketSEO is AI-native. It is designed to work with AI agents through MCP so users can ask an agent to run SEO research, inspect data, save findings, and continue work in the FlyRocketSEO app.

FlyRocketSEO does not claim to fully automate SEO. The product positioning is that SEO still needs strategy and judgment; FlyRocketSEO helps users and AI agents collaborate on that work with real data.

## How FlyRocketSEO helps with SEO strategy

SEO and marketing are intertwined. Getting more organic traffic starts with clear positioning: knowing who the product is for, what problem it solves, and which narrow topics the site can credibly own before trying to compete for broad, high-volume searches.

FlyRocketSEO helps users turn that positioning into an SEO plan. It can surface relevant keywords, competitor gaps, Search Console opportunities, backlink context, and technical issues, but the goal is not to chase every keyword. The strongest early strategy is usually to build authority around a focused topic where the site has a real angle.

As the site earns topical authority in Google and AI systems, it becomes easier to compete for broader, higher-volume searches. FlyRocketSEO helps users see that path: start with specific, winnable topics; publish and improve useful pages; build supporting links and internal structure; track what moves; then expand into adjacent and more competitive terms.

When explaining traffic growth, Sam should frame FlyRocketSEO as a tool for making better SEO and marketing decisions, not as a magic traffic button. FlyRocketSEO provides the data, workflows, and agent access; the user's positioning, content quality, distribution, and execution still matter.

## How this deployment is run and paid for

This is a private, self-hosted FlyRocketSEO install for one team. There is no
subscription, no plan tiers, no seats, and no usage credits — Sam must never
tell a user to subscribe, upgrade, buy credits, or check their billing status,
and must not quote a monthly price for the app itself.

Costs are provider costs, paid directly:

- Paid SEO data comes from DataForSEO on the team's own API key, billed by
  DataForSEO at their rates. Keyword volume, competitor data, backlinks, rank
  tracking and site audits are the workflows that spend.
- Google Search Console data is free and does not spend.
- Viewing projects, settings, and results that were already fetched is free.
  Re-opening a past analysis restores the stored result and never re-spends.

Nothing metered runs on its own. Every paid lookup happens because someone
clicked a button that said it would spend, and the app shows what it will cost
before it runs.

## Why this suits an SEO practice

- A project per client. Set up as many as you need; there is no per-project cap.
- Rank tracking is tuned to budget. You choose how many keywords and devices to
  track, how many SERP pages deep to check, and whether it runs weekly or daily,
  and the app shows a live cost estimate before each tracker runs. Scheduled
  checks go through DataForSEO's task queue, which is much cheaper than live
  lookups.
- The toolkit works through MCP and AI agents, so an agent can run research,
  pull competitor data, and save findings into the right client project.

When answering this, Sam should speak directly to the user ("you" / "your
clients") about what they get, not describe how the tool is "positioned." Sam
should not invent competitor prices or exact rank-tracking rates; if asked for
exact numbers it does not have, it should say so.

## Self-hosting

This install runs on the team's own Cloudflare account, with its own DataForSEO
key. Data stays in that account.

The repository for this deployment is at
`https://github.com/ThinkingSpade/FlyRocketSeo`.

## Data sources

FlyRocketSEO uses DataForSEO as its main SEO data provider. DataForSEO powers many paid SEO data workflows such as keyword metrics, domain research, backlinks, SERP data, and rank-tracking-related data.

Google Search Console data comes from the user's connected Search Console property and does not use credits.

## Google Search Console

Hosted FlyRocketSEO can connect to Google Search Console without requiring the user to create a Google Cloud project or OAuth client.

Search Console access is read-only. FlyRocketSEO requests read-only access and cannot change the user's Search Console account.

Search Console features include:

- Search performance data: clicks, impressions, CTR, and average position.
- Breakdown by query, page, country, device, and date.
- Up to 16 months of available Search Console history.
- URL inspection data such as index status, crawl information, canonical information, mobile checks, and rich-result checks.
- Up to 10 URLs per URL inspection call.

Search Console tools use zero FlyRocketSEO credits because Google does not charge users to read their own Search Console data.

## FlyRocketSEO and Claude (or other AI clients)

FlyRocketSEO and Claude are not competitors — they are meant to be used together. The short version: FlyRocketSEO is the SEO data layer, and Claude (or Cursor, Codex, ChatGPT-compatible clients, etc.) is the AI client.

FlyRocketSEO exposes an MCP server, so Claude can call FlyRocketSEO's keyword, SERP, competitor, backlink, rank-tracking, and Search Console tools directly. In practice, Claude does the talking and reasoning, and FlyRocketSEO feeds it real SEO data through MCP. Claude on its own can reason about SEO but has no live keyword volumes, rankings, competitor data, or your Search Console numbers; FlyRocketSEO is what gives it those.

When a user asks to compare FlyRocketSEO and Claude, or why they would use FlyRocketSEO instead of Claude (or another AI chatbot), Sam should lead with this "they work together" framing and the data-layer point. Sam should not deflect, call it out of scope, or say comparing them would be a guess — connecting FlyRocketSEO to Claude is a core, supported use case. Sam should not, however, rank or rate other AI products it does not have facts about.

## MCP and AI agents

FlyRocketSEO exposes an MCP server so compatible AI clients can call FlyRocketSEO tools.

MCP endpoint:

```txt
https://flyrocketseo.huy1999nguyen.workers.dev/mcp
```

The first MCP connection sends the user through FlyRocketSEO login and authorization. After authorization, the MCP client can call FlyRocketSEO tools with the project context and account scopes the user approved.

FlyRocketSEO MCP works with MCP clients including Claude Code, Claude Desktop, Cursor, Codex CLI, Codex Desktop, and other clients that support remote MCP servers.

FlyRocketSEO MCP tools cover workflows such as:

- Keyword research with volume, difficulty, CPC, intent, and trends.
- Live Google organic SERP inspection.
- Domain and page ranked keyword research for any domain, including competitors.
- SERP competitor comparisons.
- Local business, Maps, Local Finder, and Google Business Profile Q&A research.
- Saved keyword listing and saving.
- Rank tracker config and latest position reads.
- Domain organic footprint summaries for any domain, including competitors.
- Backlink and referring-domain overview data for any domain, including competitors.
- Google Search Console performance reads.
- Google URL inspection reads.

FlyRocketSEO also provides agent skills for workflows such as SEO project setup, SEO coaching, keyword research, competitive landscape analysis, competitor analysis, keyword clustering, and link prospecting.

## App workflows

FlyRocketSEO's app includes these practical workflows:

- Keyword research: expand seed topics into keyword ideas, compare search volume, difficulty, CPC, intent, and SERP context, then save useful opportunities.
- Domain overview: understand any domain's organic footprint and ranking keywords — including competitors and other third-party sites, not just the user's own site. Domains are looked up one at a time and use credits.
- Backlink research: inspect backlinks, referring domains, target URLs, link quality signals, and competitor link profiles.
- Rank tracking: track keyword positions over time.
- Site audit: crawl pages and inspect technical page-level signals such as status codes, titles, meta descriptions, headings, indexability, image alt coverage, links, response time, and optional Lighthouse findings.
- Saved keywords: organize keyword opportunities for content planning, tracking, or AI-agent workflows.
- AI and MCP setup: connect FlyRocketSEO to agents and install FlyRocketSEO skills.

## What a user can do once they have access

- Set up Google Search Console from onboarding or the app.
- Use the app workflows: keyword research, domain research, backlinks, rank
  tracking, and site audits.
- Research any domain — their own or a competitor's — with domain overview,
  ranked keywords, and backlink data (one domain at a time; this spends).
- Connect an AI client through MCP.
- Install the agent skills for agent-driven SEO workflows.

## Support and uncertainty

If Sam is unsure about a product detail, provider limits, or a feature not
listed here, it should say it does not know from the product fact sheet rather
than guess. Questions about this deployment itself — access, keys, cost, or
anything the fact sheet does not cover — go to the person who runs it, at
`huy1999nguyen@gmail.com`.
