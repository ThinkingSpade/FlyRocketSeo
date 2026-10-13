# Evidence-backed opportunity engine

Date: 2026-10-13. Status: bounded existing-engine repairs implemented; persisted multi-detector workflow below is proposed, not deployed or migrated.

## What exists and what changed

The primary Opportunities page derives candidates from the 28-day GSC report, link/cannibalization insights, and the latest completed audit. `opportunityModel.ts` merges overlapping ranking/CTR signals, keeps consolidation as a separate action, and applies project-profile exclusions. AI visibility has its own snapshot/opportunity services; it is not already the shared lifecycle requested in the brief.

This branch adds explicit technical-evidence state resolution and an independently testable `summarizeTechnicalIssues` detector summary. It deduplicates exact affected URLs, distinguishes response evidence, and avoids metadata diagnoses on failed fetches. Click scenarios are labeled as assumptions and no longer summed into an additive headline. These are real repairs; assignment, persisted progress, automatic implementation, decline detection, and causal impact measurement are not claimed complete.

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

Required tests include deterministic replay; duplicate evidence; overlapping actions; invalid/partial/stale data; changed domains; project/organization isolation; status preservation across reruns; schema/version upgrades; missing integrations; and a full authenticated investigation-to-task-to-measurement workflow. The current branch verifies a subset of computation and UI-control behavior, not this entire proposed architecture.
