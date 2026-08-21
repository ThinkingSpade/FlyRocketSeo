# Harvest Reach and Grading Reliability

Date: 2026-08-21
Status: Approved for implementation

## Goal

Make the deleted-domain harvest broad enough to be useful, safe when its model
or feed returns an ambiguous response, and bounded when automatic domain-rating
work repeatedly fails.

## Adjacent vocabulary

The adjacent-term request uses `minimax/minimax-m3` explicitly and does not
read `OPENROUTER_MODEL`. It keeps OpenRouter usage accounting, the existing
ZDR provider order and fallbacks, and `reasoning: { effort: "medium" }`. Its
output budget is about 1,500 tokens so a realistic reasoning trace cannot
consume the entire visible response. Up to 50 usable terms are retained from a
model response.

An empty or whitespace-only visible answer is a failed enrichment: log the
finish reason and visible text length, return no adjacent terms, and do not
cache it. A reply that resembles prose or a `<think>` trace is rejected as a
whole before individual hostname-shaped words are considered.

Vocabulary cache writes use a v2 object:

```ts
{ terms: string[], categoryByTerm: Record<string, string | null> }
```

Legacy arrays remain readable. A missing or null category resolves to the
literal `uncategorised`. The current flat adjacent-term protocol has no
category source, so newly derived flat terms also use `uncategorised`.

## Feed completion and retry semantics

`harvest_runs.skip_reason` distinguishes a completed harvest from a permanent
date skip. Only a WhoisFreaks HTTP 401 response whose parsed body has the exact
message `You cannot download file.` is the measured subscription-window case
and may permanently skip the date. A bad-key 401, malformed error body, rate
limit, transport error, and every other failure remain retryable.

Server responses expose harvested dates and skipped dates separately. A skip is
not presented as a harvest.

## Harvest breadth and limits

Each feed pass accepts `.com`, `.net`, `.org`, and `.co`. Each
project/date may store at most 450 matches. The feed remains streamed;
matching uses one compiled alternation per project, inserts remain in 15-row
chunks (therefore below D1's 100-bound-parameter ceiling), and the stream is
cancelled only after every participating project's cap is full.

## Cron scheduling and query budget

`WORKER_QUERY_BUDGET` is the single plan-level switch. It is 50 for the
current Workers Free deployment; Cloudflare D1 allows 1,000 queries per Worker
invocation on Workers Paid. Harvest and grading batch sizes are derived from
that constant with explicit headroom.

Expired-domain work runs on a dedicated offset Cron Trigger, separate from rank
checking. A tick performs exactly one unit: it either harvests one deterministic
project/date candidate or, when no harvest is pending, grades one batch.
Candidates are ordered by oldest pending date and rotated by tick among ties so
three harvestable projects cannot starve.

A capped harvest uses at most 30 insert statements for 450 matches. Together
with the fleet read, preparation, cache, feed, claim, ownership, and completion
work, the modeled worst-case ceiling is 41 subrequests (including both a lost
completion write and its fenced release), leaving nine of headroom. A day is
completed only after the stream and all inserts finish; hitting the cap is a
complete bounded harvest, while an error remains retryable and is never
recorded as a partial completed day.

## Domain-rating grading

`domain_rating_attempts` begins at zero and is capped at three. Work is
claimed atomically so overlapping invocations cannot grade the same row.
Candidates are newest first. One invocation performs at most eight lookups with
concurrency three. Candidate selection plus the remaining-count query and eight
worst-case five-subrequest lookups total 42, leaving eight subrequests of
headroom. Failures stay unknown (`domain_rating = null`) and are
summarized in one batch log containing each domain and its reason; they do not
emit one log per row.

The stored-list UI has a free `Grade now` action. It uses the same grading
service, does not call APIVerve, has no spend gate, and runs only after the user
clicks. Each HTTP invocation accepts no more than eight loaded domains and
returns the ungraded remainder. The panel sends sequential requests, refreshes
the rows and shows progress after every batch, and exposes cancellation. The
loop stops retrying a batch when it stalls or reaches the three-attempt cap,
then continues to later loaded rows. The overall operation ends after every
batch has had its bounded turn or the user cancels, so one stubborn row cannot
block the rest and the loop can never spin forever. Availability remains a
separate paid explicit-click action.

## Persistence and rollout

Additive migrations are generated for both D1/SQLite and Postgres. They add
`harvest_runs.skip_reason` and
`harvested_domains.domain_rating_attempts` without rewriting or deleting
existing data. Migrations are generated only and are not applied to any remote
database.

## Verification constraints

- Write and observe a failing Vitest regression before each production fix.
- No module imported by Vitest may statically import `cloudflare:workers`.
- D1 statements use at most 100 bound parameters.
- Modeled expired-domain work stays at or below 50 subrequests per invocation.
- `null` always means unknown.
- Paid work occurs only after an explicit click.
- Final verification is `pnpm ci:check` followed by `pnpm test`, with
  the equivalent npm scripts allowed when pnpm is unavailable.
