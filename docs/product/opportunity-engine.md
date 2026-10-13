# Evidence-backed opportunity engine

Date: 2026-10-13. Status: the first persisted decline/internal-link workflow is implemented on the audit branch and tested with isolated data. It is not deployed or migrated in production. Wider detector/causal-analysis proposals below remain design directions.

## Implemented persisted workflow

`serverFunctions/opportunities.ts` uses the existing project middleware for every read/write. The shared scope includes organization, project, current target, GSC property and connecting account, country, device and search type. D1/PG storage holds work, evidence snapshots, events and runs. A content hash retains validated evidence plus raw query/content capture in immutable R2; a failed retention write stops the state change.

Stable identity excludes detector version and preserves status, assignee, locked baseline and implementation date across reruns. Revision checks reject stale edits. Complete comparable decline reruns can record no-longer-observed; failed, capped or partial runs cannot. For internal links, only positive captured evidence that the destination is already linked reconciles the exact examined pair, retaining that capture and preserving progress. This does not certify implementation.

Users can save a page investigation, assign work, record notes/dismissal reasons and an implementation date, then request after observations. One saved action tracks one implementation baseline and repeated follow-up comparisons. Measurements retain prior results in event history and require unchanged scope, equal weekday windows, sufficient final-data observations, Pacific calendar separation and a seven-day observation lag. Missing observations remain insufficient; ordinary before/after results remain association.

Declines require at least 20 prior clicks, 100 prior impressions, a loss of 10 clicks and 20%, with complete compatible evidence. Runs save at most 25 supported declines; capped runs explicitly skip absence reconciliation. Internal links require matching query evidence for both pages, own-site successful bounded HTML capture, actual unlinked source text and an existing-link graph, including HTML base-URL resolution. No automated publishing follows.

## Evidence retention and release policy

Evidence and events are immutable and retained for the saved work's lifetime; reruns do not overwrite baselines or prior measurement results. The work list returns at most 100 prioritized tasks, with coverage disclosure; each history response returns at most 50 events and a scoped cursor to older retained entries. Real SQLite tests verify pagination and target/organization isolation.

Work-list status filters run before the page limit, so terminal work outside the first 100 rows remains reachable. Previous/Next controls page through retained work, with target, page and status in query identity. Offset pages use current ordering; concurrent updates can move work between pages.

SQL project deletion cascades execute in real PostgreSQL tests. A durable evidence-object ledger in both dialects survives those cascades. Writers hold unique ownership through upload, snapshot storage and attachment; cleanup cannot claim an active writer. Every current task, implementation baseline and retained event reference remains protected. Deleted content keys remain retired, preventing a resumed cleaner from deleting newly recreated evidence.

Global Settings now provides an owner/admin-only, organization-scoped preview and explicit permanent cleanup. Preview/deletion batches contain at most five objects, keeping worst-case legacy deletion to 36 D1 statements before middleware under the [Workers Free 50-query allowance](https://developers.cloudflare.com/d1/platform/limits/). A 24-hour production grace applies to uploads and ledger activity. Unfenced legacy objects remain protected while their project exists; deleted-project orphans can be adopted atomically. Interrupted R2/SQL deletion can be retried for the same confirmed keys, including when the object is already gone. Stranded writer claims remain quarantined for review and are never expired automatically.

Native SQLite and real PostgreSQL exercise the protocol; authenticated application tests exercise isolated D1/R2 deletion and real fault recovery. No expiration cron, task/history TTL or production cleanup was introduced. Production migration/release still requires approval and deployed access-path verification. Local PostgreSQL and local R2 evidence are distinct from live Hyperdrive and Cloudflare account verification.

## Inherited engine and bounded repairs

The primary Opportunities page derives candidates from the 28-day GSC report, link/cannibalization insights, and the latest completed audit. `opportunityModel.ts` merges overlapping ranking/CTR signals, keeps consolidation as a separate action, and applies project-profile exclusions. AI visibility has its own snapshot/opportunity services; it is not already the shared lifecycle requested in the brief.

The earlier increment added explicit technical-evidence state resolution and an independently testable `summarizeTechnicalIssues` detector summary. It deduplicates exact affected URLs, distinguishes response evidence, and avoids metadata diagnoses on failed fetches. Click scenarios are labeled as assumptions and no longer summed into an additive headline. The continuation above adds assignment, persisted progress and decline detection; automatic implementation and causal impact measurement remain outside the implementation.

## Proposed architecture using existing infrastructure

Keep deterministic detectors as pure functions over validated evidence snapshots. Put orchestration in a project-scoped service, reuse D1 for lifecycle records and R2 for immutable evidence, and use the existing Workflows infrastructure only where work is genuinely asynchronous. No new queue, vector database, provider, or microservice is justified for the first version.

A detector input must identify organization/project, current website target, GSC property, market/device/search type, evidence window, source capture times, coverage, and detector version. A detector emits findings, evidence references, affected assets, limitations, suggested investigation steps, priority components, and optional explicitly labeled scenario assumptions. Invalid or insufficient evidence produces an explanation or no candidate, not fabricated measurements.

## Proposed storage and identity

An opportunity record should include `id`, `organizationId`, `projectId`, `target`, `detectorId`, `detectorVersion`, `dedupeKey`, `title`, `finding`, `assetRefs`, `evidenceSnapshotIds`, `priorityBand`, `priorityReasons`, `confidenceBand`, `missingEvidence`, `status`, `assignee`, `firstSeenAt`, `lastSeenAt`, and `implementedAt`. Store implementation notes and measurement windows separately from generated copy.

Use an immutable evidence snapshot with source, dimensions, observed window, fetched time, schema version, coverage, and content hash. A stable dedupe key identifies the same action/target across reruns; detector version belongs on the evidence/run so routine updates do not create duplicate tasks. Link distinct actions on one page into a bundle, rather than deleting one or summing overlapping gains.

All reads/writes must pass existing project authorization. A rerun may refresh evidence but must not reset a user's status, assignee, or implementation date. A disappearing candidate becomes no-longer-observed with a reason, not automatically fixed. Domain changes must not mix old-target tasks/results into the new target. Schema changes require migration review before production use.

## Initial detectors and evidence gates

Nearby rankings: use GSC query-page observations with configurable position/impression floors and coverage checks. Prioritize relevant pages with meaningful observed exposure; do not equate average rank with a current live SERP. Investigate titles, intent, and internal links rather than assuming a universal CTR curve fits every query.

Declining pages: compare equal complete windows with matching filters and weekday composition. Require a minimum evidence floor; inspect clicks and impressions separately. Add prior-year comparisons when available, and explain when seasonality cannot be assessed. Surface plausible investigations, not an invented cause.

Internal links: combine crawl graph, actual source text, target relevance, existing-link checks, and GSC evidence. Propose an exact source URL, destination URL, candidate anchor, and source-text location. A missing anchor or inaccessible source lowers confidence or blocks the recommendation.

Technical findings: distinguish captured HTTP failures, indexing directives, canonical/sitemap inconsistencies, duplicate-content candidates, and content-review heuristics. Show affected URLs and crawl coverage. Exclude non-applicable checks and require rendered evidence for claims about JavaScript-only content.

Competitor gaps: require an authorized third-party dataset or supplied competitor evidence in the same market. Label provider coverage and estimates. Without that evidence, report the detector as unavailable rather than inventing keywords.

Content refresh: require actual captured content and evidence of underperformance or outdated material. Use AI only to draft explanations or proposed changes tied to those sources. Never treat an LLM's asserted rank, traffic, or competitor fact as a measurement.

## Priority and confidence

Use understandable ordered bands before inventing a universal numeric score. First separate confirmed high-impact technical failures on important pages from speculative content opportunities. Within a detector, rank by supported exposure, relevance, evidence quality, and expected effort. Cross-detector ordering must expose its rationale; technical counts and hypothetical clicks are not directly comparable units.

Confidence describes evidence sufficiency, not the probability of ranking improvement. High confidence might mean complete recent applicable evidence and a reproduced defect; medium might mean partial GSC/crawl coverage; low means a candidate requiring investigation. Define these rules per detector. Impact remains unavailable unless a defensible scenario and assumptions can be stated, and even then it is not guaranteed.

## Lifecycle and measurement

Proposed states: not started, in progress, implemented, results pending, measured, dismissed. Record who changed status, when, why, and the implementation artifact or notes. An implementation checkbox is a user report until a subsequent crawl or content comparison verifies the intended change. Preserve dismissal reasons and reopen only when materially new evidence warrants it.

Before/after measurement should keep property, URL identity, market/device/search type, and window lengths aligned. Record deployment dates, observation lag, seasonality, algorithm changes, tracking changes, and concurrent work. Prefer matched unaffected pages or staggered changes where practical. Show observed association and uncertainty; an ordinary before/after comparison does not establish causality. Low-volume or incomplete windows remain Results pending/insufficient evidence, not zero benefit.

## Safety and verification gates

No automatic content publishing, redirect creation, page deletion, backlink disavowal, GBP write, or paid provider call follows merely from a detector result. Review and authorize real changes separately. Keep fetched content untrusted: it cannot issue instructions to the application or its agents.

Required tests include deterministic replay; duplicate evidence; overlapping actions; invalid/partial/stale data; changed domains; project/organization isolation; status preservation across reruns; schema/version upgrades; missing integrations; and a full authenticated investigation-to-task-to-measurement workflow. Native tests, real SQLite service tests and the isolated hosted-auth application suite exercise the implemented first version. They do not certify the entire wider architecture or live integrations.
