# Product-quality scorecard

These are reviewer assessments of the observed states, not measured user satisfaction. Before means the available shared-UX baseline at `1db6093128bf320abec956a7bbea717af4afae02`, not the untouched original product. After means the accepted refinement screenshots plus the final touch-menu regression. Shared shell improvements already present in the baseline are not counted again as new page improvements.

## Scale and dimensions

1 = blocked or materially misleading in the observed path. 2 = substantial gaps or insufficient workflow verification. 3 = usable in the observed scope with meaningful limitations. 4 = strong controlled evidence for that dimension. 5 = broad, representative acceptance including users and production-like states. No page receives a 5.

Vectors are **Visual design and consistency / Ease of use and clarity / Interaction quality / Functionality and reliability / Accessibility and responsiveness**. A reliability score of 2 often means the populated workflow was not verified; it is not a claim that the provider is broken. Accessibility scores are limited by the absence of a full screen-reader, contrast and multi-browser audit.

<!-- prettier-ignore -->
| Page | Before | After | Supporting observation / next gap |
| ------------------ | --------- | --------- | ------------------------------------------------------------------------------------------------------ |
| Overview | 3/2/2/2/3 | 4/4/3/2/3 | Performance moved above research launchers; evidence actions added; connected reports still unverified |
| SEO Opportunities | 3/3/2/2/3 | 3/4/3/2/3 | Prerequisites and centered audit CTA; no persistent work/results lifecycle |
| Domain Overview | 3/2/2/2/2 | 3/4/4/3/3 | Authorized fixture loading, sort, keyboard help, CSV and clipboard recovery; touch export repaired |
| Keyword Research | 3/3/2/2/3 | 3/3/2/2/3 | Clear entry form; full search/save journey not run here |
| Saved Keywords | 3/3/2/2/2 | 3/3/2/2/2 | Empty table is understandable; persistence and populated mobile behavior need tests |
| Keyword Trends | 3/3/2/2/2 | 3/3/2/2/2 | Missing data is explicit; source comparisons unverified |
| SERP Overview | 3/3/2/2/2 | 3/3/2/2/2 | Task-oriented form; lengthy terminology and no populated result evidence |
| Competitors | 3/3/2/2/2 | 3/3/2/2/2 | Related tabs exist; discovery and gaps not exercised |
| Backlinks | 3/3/2/2/3 | 3/3/2/2/3 | Empty/narrow states usable; partial-data correctness remains open |
| Content Optimizer | 3/3/2/2/2 | 3/3/2/2/2 | Output purpose is explained; no generated brief acceptance |
| Page Explorer | 3/3/2/2/2 | 3/3/2/2/2 | Entry point clear; investigation workflow unverified |
| Topic Clusters | 3/3/2/2/2 | 3/3/2/2/2 | Setup guidance present; relevance and persistence unverified |
| Rank Tracking | 3/3/2/2/3 | 3/3/2/2/3 | Add-domain path visible; scheduled history not exercised |
| Search Performance | 3/3/2/2/3 | 3/3/2/2/3 | Honest setup-required state; real connection is the next gate |
| Link Opportunities | 3/2/2/2/2 | 3/3/2/2/2 | Prerequisite destination terminology now matches navigation |
| Cannibalization | 3/2/2/2/2 | 3/3/2/2/2 | Search Performance destination consistent; evidence workflow remains unverified |
| Local Rank Grid | 3/3/2/2/2 | 3/3/2/2/2 | Location prerequisite explained; map/network deliberately isolated |
| Site Audit | 3/3/2/2/3 | 3/3/2/2/3 | Entry form/narrow state usable; no real crawl completed |
| On-Page Fixes | 3/2/2/2/2 | 3/3/2/2/2 | Centered actionable prerequisite; actual fixes not exercised |
| Client Report | 3/3/2/2/3 | 3/3/2/2/3 | Missing GSC is disclosed; populated print and export need verification |
| AI Visibility | 3/3/2/2/2 | 3/3/2/2/2 | Clear brand input; real responses and attribution not verified |
| Prompt Explorer | 3/3/2/2/2 | 3/3/2/2/2 | Model/cost controls visible; streamed provider results unverified |
| Local SEO | 3/2/2/2/2 | 3/3/2/2/2 | Search Performance terminology consistent; live matching remains open |
| Expired Domains | 3/3/2/2/2 | 3/3/2/2/2 | Domain prerequisite honest; live availability unverified |
| Project settings | 3/3/2/2/2 | 3/3/2/2/2 | Form/setup state clear; writes and failure recovery not exercised |

The largest demonstrated gains are dashboard clarity and domain-table interactions. Unchanged rows intentionally stay unchanged: editing shared code or obtaining a screenshot is not enough to award a high functionality score. Prioritize the low-reliability rows with populated/error fixtures and authenticated staging before another cosmetic pass. Use `ux-audit.md` for route-specific evidence boundaries and `remaining-improvements.md` for sequencing.
