# 0015 — Depth wave 11: SEO Opportunities tab + last blank forms

## Motivation

Two asks, both continuing wave 10's project-centric direction.

**1. "Don't we need a tab giving users suggestions on how to rank better,
audit their site and see what's missing?"** — Correct, and Ubersuggest
ships exactly this ("SEO Opportunities" in their sidebar). We already
compute every ingredient, but each lives in its own tab and none of them
answer _"what should I do next, in what order"_:

- GSC striking distance → pages one push from page one
- GSC CTR opportunities → good rank, bad click-through
- Cannibalization → pages competing with each other
- Site audit pages → missing titles/metas, thin content, bad status codes

**2. No tab should open as a bare form** — Local SEO, Local Rank Grid, and
Page Explorer are the last three that still do.

Everything here is free: GSC is first-party, and audit issues are derived
from pages already crawled and stored. No new metered calls.

## Features

### 1. New "SEO Opportunities" tab

The one exception to the no-new-nav-items rule, because the user asked for
it directly. Sits under **My Site**, beside Site Audit.

**Ranked action list.** Click-denominated opportunities are scored on a
single honest axis — _estimated monthly clicks at stake_ — so they can be
ordered against each other:

- _Quick win_ (striking distance): `impressions × (CTR@3 − CTR@current)`
- _Rewrite title/meta_ (CTR gap): the report's existing `missedClicks`
- _Consolidate_ (cannibalization): `impressions × splitShare × 0.3`, the
  discount reflecting that consolidation recovers only part of the split

Each row carries its type, the query, the affected page, the estimate, and
a deep link to the tab that does the work (Content Optimizer for a quick
win, GSC Insights for a CTR fix, Cannibalization for a consolidation).

**Technical issues.** Derived from the latest completed audit's stored
pages, grouped with a severity and an affected-page count: non-200 status,
missing/duplicate title, missing meta description, missing or multiple H1,
thin content (<300 words), images without alt text. Deliberately kept out
of the click-ranked list — page counts and click estimates aren't the same
unit, and pretending otherwise would be dishonest ranking.

Missing sources degrade independently: no GSC → the keyword sections
explain how to connect; no audit → a prompt to run one.

### 2. Analyze prompts on the last three tabs

`AnalyzeDomainPrompt` (wave 10) extended to Page Explorer (homepage of the
project domain), Local SEO (business lookup seeded from the domain), and
Local Rank Grid (keyword still required, so the prompt explains the scan
rather than firing one).

## Non-goals

- No new metered calls; opportunities read what already exists.
- No auto-running audits or rank checks.

## Testing

Opportunity scoring and audit-issue derivation are pure and unit-tested;
standard gates; live verification against deliotx.com (GSC connected, one
completed audit).
