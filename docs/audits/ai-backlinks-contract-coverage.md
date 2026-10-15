# AI and backlink comparison contracts

Branch: `audit/flyrocketseo-reliability-2026-10-13`, continuation from `bb93af37`.
These contracts cover fields consumed by the application. Fixtures exercise the
real SDK HTTP decoder and application services; they do not certify live access.

| Surface                               | Implemented and fixture verified contract                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI HTTP envelopes                     | Successful missing/malformed payloads and declared platform, market, language, target, comparison-group or prompt mismatches fail with the original billed-task metadata. Count observations require safe nonnegative integers; invalid values stay unknown and genuine zero remains zero.                                                                                                                  |
| AI totals and comparison shares       | Missing relevant platform observations suppress combined totals. Each compared group requires exactly one matching observation on every included successful platform. Missing, duplicate or foreign-platform groups cannot produce a complete share or invented zero.                                                                                                                                       |
| AI sampled trend                      | Explicit null and missing prompt-month observations stay gaps. Invalid calendar observations are excluded. The chart shows sampled AI search volume, preserves gaps and does not relabel it as a mentions history.                                                                                                                                                                                          |
| AI lookup cache, saved result and CSV | Scoped v2 cache retains organization/project/target/market and original capture. Legacy answers and source rows remain readable; uncertified derived totals, shares and synthesized trends are hidden. CSV includes original source, capture, target and each platform's actual market; ChatGPT observations remain US/en.                                                                                  |
| Prompt Explorer                       | Model answers retain individual source, original capture and requested supported search-country scope through cache reuse. Legacy answers remain readable with an unavailable-date label and no metered refresh. Unreported web-search use and invalid token counts stay unknown. Typeless documented citation annotations are supported; unsafe URLs and explicit unrelated annotation kinds are rejected. |
| Persisted AI visibility               | Cached results are stored on their original capture day. History reads immutable result scope and values, excludes another market and uncertified legacy metrics from current trends, and deduplicates older copies of the same captured day. Share comparisons require the same competitor set. Useful legacy answers remain readable.                                                                     |
| Backlink comparison                   | Invalid counts and hundred-point scores stay unknown. New/lost net requires both observations. Missing requested referring-domain counts suppress complete leader/place/gap claims while retaining useful rows. Restored cache rows are normalized and unsupported net values recomputed.                                                                                                                   |
| Backlink intersections                | Only requested positive ordinal slots with a consistent referring-domain identity contribute. Declared task/result targets, excluded target sets and fixed request scope must agree. Missing backlink counts make the aggregate unknown. Foreign, malformed and duplicate provider identities retain billed error evidence in the SDK contracts.                                                            |
| Network concentration                 | Complete universe size and complete valid counts are required for profile-wide concentration. Unknown totals/shares stay null. Concentration is described as an observed signal requiring review, not proof of a purchased link network.                                                                                                                                                                    |
| Backlink cache                        | Comparison/related caches include authorized organization and project, target, request parameters and contract version. Genuine empty responses are reusable. Cache writes settle before return; failed cache writes preserve the paid result.                                                                                                                                                              |
| Subdomain identity                    | Excluding subdomains must not replace an entered SEO hostname with its registrable parent. WHOIS/registration/availability deliberately use an explicit registrable-domain helper and preserve batch deduplication. Provider-specific scope remains a request contract, with unsupported Labs exclusion disclosed in the keyword register.                                                                  |
| Backlink row exports                  | All four tables retain original provider, full captured target/mode/scope, capture, filter/sort/page parameters and coverage in CSV/Sheets data. Export metadata comes from the returned capture, rather than current form values or the summary's separate capture. Null stays blank/unknown, zero remains zero, and formula safeguards remain.                                                            |
| Local citation discovery              | One explicitly authorized organic SERP search retains captured organization/project, business/disambiguator, query and market/language. Versioned scope is checked, original capture and successful empty results are reusable, and awaited cache puts prevent stale saved-run copies. Useful legacy discovery rows remain readable; unobserved directories are not proved absent.                          |

Verification increments: 90 AI/hostname tests in 16 files, 12 prompt/SDK cases
after the citation compatibility fix, and 108 backlink service/rendering tests in
10 files passed. Type-aware lint passed for each increment. The final integrated
native, browser, PostgreSQL, static and build results are recorded in
`verification-results.md`, not inferred from these focused counts.

Citation cache/scope/query/corroboration verification passed **28 tests in four
files** (`.logs/citation-cache-green.log`). The previously verified native run at
`1096bcf0` passes **3,780 tests in 396 files**; focused increments are subsets, not
additional totals. Actual browser citation lookup/restoration, backlink operations
and exports have their execution status recorded separately in
`verification-results.md` and `tool-operation-coverage.md`.

The later raw-SDK repair in `c1454376` accepts documented **40102** empty
SERP metadata (`items: null`, zero item/search counts), including a canonical
decimal-string location echo. Missing payloads, malformed counts, foreign scope
and **40501 Invalid Field** failures retain billed errors and cannot create a
saved empty capture. The two new raw HTTP/service suites pass **45 tests**;
the broader affected run passes **87 tests in seven files**. Original capture,
single paid POST, cache reuse and saved-run identity remain asserted. The
corresponding new actual-browser case passes in the complete fresh-state
**83-case** application run. Latest source `ff2e0530` passes **3,825 native tests
in 398 files**; focused counts are included in that total, never added to a
previous complete run.

Field references: [AI search volume](https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/search/live/),
[AI aggregate metrics](https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/aggregated_metrics/live/),
and [LLM response citation annotations](https://docs.dataforseo.com/v3/ai_optimization-chat_gpt-llm_responses-live/).
Canonical empty/error references: [DataForSEO 40102 response shape](https://dataforseo.com/help-center/what-does-the-40102-error-mean)
and [task status codes](https://docs.dataforseo.com/v3/appendix/errors/).
The existing aggregate endpoint is retained; new datasets or paid services are
not introduced by this work.

Live provider entitlement, responses, OAuth and deployed job/storage acceptance
remain **blocked** because test-account access is unavailable. No
production data or real paid provider response was used for these tests. The
approved release and exact production version are recorded in
`publication-gate.md`; live authenticated provider/OAuth acceptance remains blocked.
