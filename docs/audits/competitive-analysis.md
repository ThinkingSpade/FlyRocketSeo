# Competitive workflow benchmark

Research date: 2026-10-13. Basis: current official vendor documentation and public product pages, not a hands-on authenticated evaluation of paid accounts. Product recommendations below are design judgments, not claims of verified feature parity.

The audit-branch continuation now implements progressive navigation and the first
evidence-to-work-to-results flow. The comparisons below remain product direction,
not certification of parity or live datasets. Current application verification and
remaining gates are in `verification-results.md` and
`../product/implementation-checklist.md`.

## What the benchmarks actually show

Ahrefs' Opportunities documentation, updated September 3, 2026, describes content, link, and technical opportunities that open supporting reports. Examples include nearby ranking opportunities, content gaps, declining content, and potential cannibalization. Its overlap guidance calls for checking search intent and page similarity before consolidation [A1]. The useful pattern is an evidence-linked investigation, not simply a higher metric count.

Semrush's SEO Dashboard documents a project overview combining product widgets and connected Google data, including setup states where a tool is not configured [S1]. Its Site Audit Issues report organizes findings by severity and supports affected-page detail and fixing guidance [S2]. Compare-crawl reporting compares actual stored crawls [S3]. These are useful models for context, drill-down, and progress rather than a reason to reproduce its full navigation surface.

Ubersuggest's public product page now explicitly advertises prioritized next actions, quick wins, gaps, and code fixes rather than only raw metrics [U1]. Its audit entry starts with a domain or page URL and describes an overview followed by issue-fixing instructions [U2]. Public example figures are marketing illustrations, not measurements or proof of output accuracy.

## Implication for FlyRocketSEO

Actionable opportunities alone are not a unique differentiator: the competitors already offer them. A stronger proposed position is an understandable, traceable workflow from first-party evidence to a reviewed implementation and an honestly measured result, while retaining specialist research tools. This is a product hypothesis to validate with users, not an established competitive advantage.

Navigation: keep five task-based groups and put Overview/Opportunities first. The branch implements that regrouping without removing destinations. The next step is progressive disclosure, not another large sidebar.

Domain and competitor research: unify domain input, location/language, organic pages/keywords, historical evidence, and competitor gaps. Keep the actual target visible so a competitor investigation cannot be mistaken for the user's project performance. Preserve saved runs and make paid refresh a distinct action.

Keyword discovery and tracking: one discovery workflow should lead to saved keywords, a content brief, SERP evidence, or explicit tracking enrollment. Tracking is a recurring observation workflow, not an automatic side effect of research. Show the scope and cost before enabling schedules.

Backlinks: consolidate summary, referring-domain detail, competitor intersection, and actual link history into one surface. Missing index data must not become a healthy link profile. Avoid presenting a provider rank or spam score as a Google metric.

Technical audit: severity is useful only with evidence, affected URLs, crawl coverage, a reason, and a safe next action. Separate confirmed HTTP failures from review heuristics. Compare actual crawl snapshots; do not fabricate smooth historical progress.

Content optimization: use the captured page, query performance, and relevant competitor evidence to generate a reviewable plan. Provide source links and known gaps. Do not frame generic word-count or heading rules as guaranteed ranking improvements.

Reporting: export the same evidence windows, missing-source labels, and implementation history shown in the app. A report should not silently purchase new analyses or erase uncertainty to look polished.

## Missing or fragmented workflows

The main Opportunities page currently aggregates client-side rules but lacks the shared persisted task lifecycle described in the brief. Page Explorer, GSC insights, link opportunities, content briefs, and technical checks exist as separate entry points. Reuse them behind one page investigation instead of replacing their services. Keep specialized AI/local/expired-domain tools accessible but secondary to the main connected-site workflow.

## Dataset boundaries

A crawler of the user's own website and GSC can support first-party performance investigations, crawl findings, and internal-link candidates. They cannot establish competitors' complete organic traffic, a global backlink graph, or universal AI answer visibility. Those require licensed/provider datasets with explicit coverage and cost. Reuse existing DataForSEO capabilities first; the cost register is in `data-integrity.md`. No new paid service is part of this branch.

## Primary references

[A1] Ahrefs Opportunities help: https://help.ahrefs.com/en/articles/9127446-where-can-i-quickly-find-opportunities-to-improve-my-website-s-seo

[S1] Semrush SEO Dashboard: https://www.semrush.com/kb/1195-seo-dashboard

[S2] Semrush Site Audit Issues: https://www.semrush.com/kb/541-site-audit-issues-report

[S3] Semrush Compare Crawls: https://www.semrush.com/kb/545-site-audit-compare-crawls-progress

[U1] Ubersuggest product overview: https://app.neilpatel.com/en

[U2] Ubersuggest Site Audit entry: https://app.neilpatel.com/en/analyze/site-audit
