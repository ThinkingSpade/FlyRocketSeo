# Page investigation and content evidence contracts

Branch: `audit/flyrocketseo-reliability-2026-10-13`; continuation from `bb93af37`.

Page Investigation retains independent exact-page GSC and stored crawl evidence,
scoped actions and persisted work. Its existing provider-research view now has
explicit consumed-field contracts rather than treating a returned keyword sample
as a complete page census.

- Page Explorer retains fractional estimates; missing row traffic, omitted usable
  rows or overflow leaves aggregate sample traffic unknown. Missing provider total
  keyword count does not become the displayed sample size. Rank distributions and
  concentration claims require their relevant observations.
- Versioned cache identity contains organization, project, full URL including query,
  market and language. URL fragments are not page identities. Backlinks use that
  captured full URL; Labs keyword rows use hostname/path variants, with the query
  limitation disclosed. Restoring retains original capture.
- Cache writes settle before copying a saved run. A failed put preserves the paid
  result and skips a history copy that could contain older data. Legacy rows remain
  readable; their previously synthesized traffic total is not certified.
- Content briefs retain separate original SERP and related-term captures and
  market scope. A cached SERP is not restamped as a fresh ingredient. Failed terms
  are unavailable and have no invented capture date. Successful empty brief and
  outline observations are reusable, including across immediate repeated reads.
- Outline cache identity includes organization/project/URL. SDK malformed success
  and declared request-scope mismatch retain billed-task evidence. Browser-rendered
  resource arrays select the requested page. Capture without browser rendering can
  omit headings created by scripts; no rendered-completeness claim is made.
- Invalid term volumes and word counts are unknown; reported zero remains an
  observation and participates in the observed word-count sample. Missing heading
  capture is not zero H2 sections. Derived structure uses known heading samples
  and discloses omitted coverage.
- Opening/restoring a brief authorizes no outline request. Separate outline consent
  must belong to the specific captured brief; selecting another saved brief cannot
  carry that approval to its different competitors.

Focused Page Explorer verification passes **29 tests in six files**. Content,
On-Page SDK, heading/count mapping and actual evidence consumers pass **31 tests
in five files** (`.logs/content-evidence-final.log`). The outline authorization
and acceptance-boundary run passes **18 tests in two files**, including 12
outline-key cases (`.logs/content-outline-authorization-native.log`). These are
overlapping focused evidence, not additional totals: final source `1096bcf0`
passes **3,780 native tests in 396 files**, static checks and production build.

Acceptance cases exercise investigation handoffs, full-URL restoration, unknown
sample totals, original ingredient capture and explicit outline consent. A real
browser reproduction showed consent carrying into a different restored brief;
the captured brief identity now gates its outlines. Final execution status belongs
in `verification-results.md`, not inferred from test definitions. Real OAuth,
provider entitlement and deployed capture/job recovery are separate blocked gates.

Primary field definition: [DataForSEO instant page results and rendering options](https://docs.dataforseo.com/v3/on_page/instant_pages/).
Live provider responses, entitlement, OAuth and deployed capture recovery remain
blocked without staging access. No paid request, production mutation or deployment
was used to verify these contracts.
