# Backlinks: reach the links, drill into them, and finish the page

Date: 2026-08-10
Status: proposed

> This spec was reviewed by an adversarial pass that found 3 blockers, 10 major and 4
> minor defects in its first draft. All are corrected below. Where the correction
> changes something non-obvious, the reasoning is kept inline rather than silently
> fixed.

## Problem

A user opened the Backlinks tab for `americavending.com` and said two things:

1. "i need to be able to expand and see the specific backlinks"
2. "can you make it premium, and feel more finished out. Like it's a complete SaaS product"

**The links are unreachable on a restored run.** `BacklinksResultsCard` — the paginated
per-link explorer with sub-tabs, filters, sorting and CSV export — is suppressed when
the page shows a restored run (`BacklinksPageContent.tsx:240`). With no `target` in the
URL every row query is disabled anyway. The page visibly ends after the last free card
and reads as "this product has no list of my actual backlinks".

**The breakdown cards are dead ends.** Six cards render counts as inert `<li>` elements
(`BacklinksProfileSections.tsx:71`). "Site types → Blogs 14" cannot be opened.

**The page reads as accumulated rather than designed.** Twenty-odd same-weight sibling
surfaces; degenerate data published as analysis (a blank country label at 28, single-row
lists drawn as full-width 100% bars, a Domain Rank chart flat at zero for a year); three
different spam-score thresholds; hand-rolled surfaces where Kumo already ships equivalents.

## Scope

- **Phase 0** — fix a pre-existing billing defect that this feature would otherwise multiply.
- **Part A** — a restored run can reach the per-link table.
- **Part B** — the six breakdown cards become drill-downs into that table.
- **Part C** — a presentation pass so the page reads as a finished product.

Non-goals: no new paid DataForSEO capability; no redesign of the search/history/restore
system beyond the touch points named; the remaining defects in "Found in passing" are
recorded, not fixed here.

## Phase 0 — metered queries must not auto-retry (BLOCKER, pre-existing)

`useMeteredQuery` is documented as the "safe-by-default query wrapper for paid
DataForSEO requests" (`useMeteredQuery.ts:31`). It neutralizes every auto-*refetch*
vector — `staleTime: Infinity`, `refetchOnMount`, `refetchOnReconnect`,
`refetchOnWindowFocus` (`useMeteredQuery.ts:54-63`) — but **never sets `retry`**. The
global client sets no retry default either (`queryClient.ts:3`). TanStack's browser
default is 3 retries, so a failing paid query invokes the server function up to **four
times**, and each invocation can reach the billed provider independently (a failed row
call is not cached before the provider succeeds, `backlinksServiceData.ts:142`).

Measured: **23 files call `useMeteredQuery`; only 3 pass `retry: 0`** — 
`BacklinksTimelineSection.tsx:73` (with a comment describing exactly this hazard),
`ContentOptimizerPage.tsx`, `PageExplorerPage.tsx`. Three separate call sites
independently patching the same danger is evidence the default is wrong.

**Fix:** make `retry: 0` the enforced default inside `useMeteredQuery`, and add `retry`
to the `Omit<>` so call sites cannot re-enable it. Remove the three now-redundant local
overrides. Test: a rejecting metered query invokes its `queryFn` exactly once after the
period in which retries would have elapsed.

This must land before Part B, which adds new paid call sites.

## Verified technical facts

### The six breakdowns map to real, filterable row fields

`GET /v3/backlinks/available_filters` (Basic auth, **`cost: 0`**) is the authority on
what an endpoint can filter on. It reports 51 filterable fields for the backlinks
section; all six of ours are present:

| Card | Summary source (`backlinksServiceData.ts:362-385`) | Row filter field | Type |
|---|---|---|---|
| Top countries | `referring_links_countries` | `domain_from_country` | `str` |
| Top-level domains | `referring_links_tld` | `tld_from` | `str` |
| Link types | `referring_links_types` | `item_type` | `str` |
| Link attributes | `referring_links_attributes` | `attributes` | `array.str` |
| Site types | `referring_links_platform_types` | `domain_from_platform_type` | `array.str` |
| Placement on page | `referring_links_semantic_locations` | `semantic_location` | `str` |

Field names confirmed against the vendored `dataforseo-client@2.0.19` typings
(`BacklinksBacklinksLiveItem.d.ts` lines 21, 46, 53, 95, 99, 121).

### Operators are defined per field TYPE

Per <https://docs.dataforseo.com/v3/backlinks-filters/>: `bool` → `=`, `<>`; `num` →
`<`, `<=`, `>`, `>=`, `=`, `<>`, `in`, `not_in`; `str` → `match`, `like`, `ilike`, `in`,
`=`, `<>`, `regex` and negations; **`array.str`/`array.num` → `has`, `has_not` ONLY**;
`time` → `<`, `>`. DataForSEO's own example is
`["domain_from_platform_type","has","blogs"]`.

**Trap:** the vendored typings (`BacklinksBacklinksLiveRequestInfo.d.ts:41`) document
only the **`str`** operator list and omit `has`/`has_not` entirely. Reading the typings
alone makes array filtering look impossible and pushes toward `in` or `like`, which are
wrong for arrays and would silently return wrong rows to a paying customer.

Consequently the Link attributes card **is** a real drill-down:
`["attributes","has","nofollow"]` is valid, as is `has` against `ugc`, `sponsored`,
`noopener`, `noreferrer`, `external`. Do **not** implement the nofollow row as
`dofollow=false` — that is a different concept (a boolean follow status, not an
occurrence of the `nofollow` attribute).

### `filters.linkType` does not mean "link type"

`backlinksRowsFiltersSchema.linkType` is `z.enum(["dofollow","nofollow"])` mapping to
`["dofollow","=",bool]` (`backlinksApiFilters.ts:112`) — it is **follow status**. The
Link types card is `item_type` and needs a separate key. Rename the filter panel's
"Link Type" control to **"Follow status"**.

### `domainFrom` is a server-shape precedent only

It exists in `backlinksRowsFiltersSchema` (`backlinks.ts:86`) and the server builder,
but **not** in `BacklinksTabFilterValues`, `EMPTY_BACKLINKS_FILTERS`,
`BACKLINKS_FILTER_FIELDS` or `toBacklinksFiltersPayload` — expansion constructs
`{domainFrom}` directly. So it de-risks the request shape but supplies no client
plumbing. Part B must add, for each of the six keys: the client type, the empty default,
the field list entry, payload conversion, chip formatting and draft synchronization.

Existing persisted filters remain compatible: `loadFromStorage` starts from the expanded
fallback and overlays known string keys (`useBacklinksFilters.ts:36-69`), so new keys
default to empty. No migration needed.

### Condition budget

`MAX_DATAFORSEO_FILTER_CONDITIONS = 8` (`domain.ts:90`), enforced at `filters.ts:70`.
Each drill-down is exactly one tuple, so all six simultaneously cost 6.

## Part A — a restored run can reach the links

### Composition

Render the `BacklinksResultsCard` shell in a distinct restored mode with a
purpose-built empty body. Render: card chrome, Kumo `Empty` body, CTA. Hide: sub-tab
strip, tab descriptions, Filters button and panel, grouping toggle, Export/Actions
menus, table, column headers, skeleton, pagination. No permanently disabled controls —
a control that can never be enabled in this state is worse than a hidden one. The CTA is
the card's only focusable element on initial render.

### Copy

Headline: **Individual links aren't loaded**
Body: **This saved run kept the summary. Loading individual links starts a fresh lookup.**
Button: **Refresh & load links**

### A dedicated restored-refresh state — not a bare `runBacklinksSearch` call

*(Corrected: the first draft claimed the existing canonical runner was sufficient.)*
`runBacklinksSearch` returns `void` and coordinates neither overview nor row success
(`BacklinksPage.tsx:254-284`), and neither it nor `navigateToBacklinksSearch` sets
`view: "all"` (`useBacklinksPageData.ts:335-350`) — a missing `view` means
`one_per_domain`. Worse, the moment navigation supplies a target, restored mode ends and
`overviewLoading` replaces the saved summary with a full skeleton
(`BacklinksPageContent.tsx:155-162`), contradicting "keep the restored summary visible".

Define a restored-refresh state keyed to **Backlinks row success**:

- Reuse `runBacklinksSearch`'s authorization and history side effects, but navigate
  atomically with `view: "all"` included in the same `navigate` call.
- While rows load, keep rendering the restored overview data rather than the skeleton.
- Keep Timeline unmounted until row success.
- Handle both mixed outcomes explicitly: overview-success/rows-failure keeps the summary
  and shows the row failure in the Results card; rows-success/overview-failure keeps the
  restored summary visible with a non-blocking notice.

Preflight the search-tab limit **before** authorizing: `runBacklinksSearch` currently
ignores `openTab`'s `dropped: true` result (`BacklinksPage.tsx:272-284`,
`useSearchTabs.ts:194-225`), so only the search form validates today. Check
`canOpenTab` inside the runner, not merely via a disabled CTA.

Normalize target emptiness once. Auto-restore uses `target.trim()`
(`BacklinksPage.tsx:171`), `BacklinksBody` uses `!searchState.target`
(`BacklinksPageContent.tsx:144`), and query readiness uses `Boolean(target)` — a
whitespace-only URL target satisfies some and not others. Derive a single
`hasTarget = target.trim() !== ""` and use it for restore detection, query enabling, CTA
validation and corrupt-target handling.

### Failure and edges

On failure: preserve the summary, return to the not-loaded composition, show
*"Individual links couldn't be loaded. The saved summary is still available."*, change
the CTA to **Try again**, and never retry automatically. A successful zero-row lookup is
not this state — it renders ordinary loaded chrome.

- Missing/corrupt stored target → no enabled CTA; *"This saved run can't load its links.
  Enter a target above."*
- Tab limit reached → block; *"Close a tab to load these links."*

### "Sole action" — precisely stated

*(Corrected: it is not literally sole.)* `BacklinksSearchCard` remains above the restored
content, is prefilled from the last run, and invokes the same callback
(`BacklinksPage.tsx:306-315`). The Results CTA is the sole **contextual restored-run**
action. Do not suppress the generic search form — Part C keeps it as a compact toolbar,
and a user must still be able to search a different target. Drop `onRunAgain` from
`RestoredRunBanner` at the Backlinks call site only; the prop is already optional
(`RestoredRunBanner.tsx:32`), so the 7 other tabs using that component are unaffected.

### Cost disclosure

No price, no warning, no confirmation. "Starts a fresh lookup" plus an outcome-labelled
button is sufficient consent. The contract that matters: **mounting or viewing this
state never triggers a request.** Verified safe on that axis — `useAhrefsDomainRatings`
only fetches on explicit `loadRatings`, and the compare section's own buttons are its
authorization boundary.

### Siblings in the restored state

Compare renders (its buttons gate spending). Timeline stays hidden until row success —
it fetches automatically once authorization exists. Broken-link reclaim stays hidden.
Results precedes Compare and Timeline in **both** states so nothing is inserted above
the freshly focused Results card.

## Part B — breakdown drill-downs

### Filter model

| Card | New filter key | Emitted clause | Chip label |
|---|---|---|---|
| Top countries | `sourceCountry` | `["domain_from_country","=",v]` | `Country: India (IN)` |
| Top-level domains | `sourceTld` | `["tld_from","=",v]` | `Top-level domain: .com` |
| Link types | `itemType` | `["item_type","=",v]` | `Link type: Anchor` |
| Link attributes | `linkAttribute` | `["attributes","has",v]` | `Attribute: Nofollow` |
| Site types | `sourcePlatformType` | `["domain_from_platform_type","has",v]` | `Site type: Blogs` |
| Placement on page | `semanticLocation` | `["semantic_location","=",v]` | `Placement: Article` |

Store the **raw API value**; humanize only the label. Countries render via
`Intl.DisplayNames`. Different dimensions AND together; a second value within one
dimension replaces the first.

**Do not aggregate selectable rows.** *(Corrected.)* Part C item 2 proposes merging
equal normalized labels, but `toLinkBreakdown` carries only `{label, value}` with no raw
identity list (`backlinks-results.ts:50-53`), and one row must map to exactly one raw
value to emit one condition. Either keep selectable rows unaggregated, or carry
`rawValues[]` through the result schema, emit a defined OR group, and revise condition
counting and chip identity accordingly. Any aggregation must happen **before** sorting
and truncation to five (`linkBreakdown.ts:10-23`). Default: do not aggregate.

### Selectable-row affordance

Each selectable row is a real Kumo `Button` (`variant="ghost" size="sm"`) so Enter/Space
and screen readers work, with compound-row overrides:

```
group h-auto min-h-9 w-full touch-manipulation flex-col items-stretch gap-0.5
rounded-md px-2 py-1 text-left font-normal
hover:bg-base-200/70 active:bg-base-200
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
focus-visible:ring-offset-2 focus-visible:ring-offset-base-100
motion-reduce:transition-none
```

Top line `flex w-full min-w-0 items-baseline gap-2`: label `min-w-0 flex-1 truncate
text-sm`, count `shrink-0 tabular-nums text-base-content/60`, and a bare `ArrowDown` at
`size-3.5 shrink-0 text-base-content/35` strengthening to `/60` on hover/focus. Always
faintly present (touch has no hover); never animated, never in a circle. The bar stays,
gaining `group-hover:bg-primary/80`, and is `aria-hidden`.

Accessible name: *"Show All links for Site type: Blogs. Summary count: 14."*

**Applied state uses `aria-pressed`, not `aria-current`.** *(Corrected.)* A persisted
category can coexist with `view` unset or another sub-tab active, so `aria-current`
would announce a destination as current while the user reads Referring Domains.
Re-activating an already-applied value does not change the filter but **may still issue
one request** if the destination key (which includes `rowsMode`) is uncached. Show the
applied row with `aria-pressed="true"`, subtle `bg-base-200/60`, and a bare `Check`.

### Non-selectable rows

Static content, not disabled buttons; not in the tab order. Same dimensions, but
`cursor-default px-2 py-1 text-base-content/55`, no hover, no focus ring, no arrow,
count at `/45`, bar fill `bg-base-300`.

Non-selectable when the label is empty/whitespace — render `Country not provided`, `TLD
not provided`, `Link type not provided`, `Attribute not provided`, `Site type not
provided`, `Placement not provided`. A literal non-empty value such as `unknown` is
**not** blank when the filter accepts it.

*(Corrected: `link` is not proven unfilterable.)* The summary vocabulary includes `link`
while the row prose omits it, but `item_type` is an unrestricted `string` and this spec
already establishes that the vendored prose is unreliable. Treat `link` as selectable
until a captured fixture or a provider check proves otherwise; a documentation
vocabulary mismatch is not proof.

If a whole card has no selectable rows, place **Summary only** beneath its heading at
`text-xs text-base-content/50`.

While Part A's not-loaded state shows, every row is static and the section carries
*"Load individual links to use breakdown filters."* Rows must not become an alternative
refresh trigger.

### Honest counts — corrected copy

*(The first draft's user-facing copy was factually false.)* It said table totals differ
"after spam filtering and duplicate removal". Neither applies here: web requests
explicitly disable implicit spam filtering (`serverFunctions/backlinks.ts:31`), and
drill-down forces All links, which emits `mode: "as_is"` — no grouping. Shipping that
sentence would have taught users a false explanation.

One quiet note above the grid, `text-xs leading-relaxed text-base-content/55`,
associated via `aria-describedby`:

> Selectable rows filter All links; each selection runs a fresh lookup. Summary counts
> cover the whole profile and are measured separately from the table, so totals can
> differ.

Genuine divergence mechanisms, to cite only when they actually apply: other active
filters AND-ing in; independent cache snapshots (overview and rows use separate keys
with independent 6h TTLs, plus `staleTime: Infinity` client-side); provider row
granularity and `links_count` multiplicity; a null `total_count` (`envelope.ts:194`);
and overlapping array categories — one link can carry several attributes or platform
types, so **those card rows are not mutually exclusive and must never be summed**.
Mention spam only when a spam-score filter is active, and grouping only outside All
links.

Do not repeat the count in the chip, write "14 expected", or show "0 of 14".

Zero-result copy: **No matching links in the table** / *"The summary count is measured
across the whole profile and can include links this table doesn't return."*

### Consent

A real button, activated only by click/Enter/Space, under an instruction that says each
selection runs a fresh lookup, is sufficient consent — equivalent to the existing
Apply-filters boundary. **No confirmation dialog.** Never initiate a lookup from hover,
focus, visibility, prefetch, or selection preview.

### Chip strip

Inside the Results card, below the expanded panel, immediately above the table body:
`flex min-w-0 flex-wrap items-center gap-2 border-b border-base-300 bg-base-200/30 px-4
py-2`, led by **Category filters** at `text-xs font-medium text-base-content/60`.

Each chip is a whole Kumo outline `Button` — not a `Badge` wrapping a nested close
button, which is an a11y defect: `max-w-full rounded-full bg-base-100 px-2.5 font-normal
text-base-content hover:bg-base-200 focus-visible:ring-primary`, trailing bare `X` at
`size-3.5 text-base-content/50`, `aria-hidden`. Accessible name: *"Remove Site type:
Blogs filter"*.

Clearing a chip clears only that dimension, preserves other filters, keeps All links,
resets to page 1, runs the lookup through the same transaction below, and moves focus to
the next chip (or the Filters button).

`activeFilterCount` includes these fields — one badge, not two. Panel Clear all/Reset
clears both manual and category filters.

**Draft merging needs a real API.** *(Corrected: it was unimplementable as first
written.)* `BacklinksFilterPanel` controls only applied values, and the sibling
`DomainFilterPanel` privately owns `draftFilters` and replaces the whole draft whenever
applied filters change (`DomainFilterPanel.tsx:38-76`). Either make the draft controlled
or expose a functional external merge API, and define behavior for add, replace, chip
removal and Clear all. Without this, dirty drafts are silently lost, or a stale draft
later resurrects a removed chip.

### One transaction per row-query change

*(Corrected: the first draft's premise and mechanism were both too loose.)* A distinct
query key is not automatically billed — client cache is permanently fresh
(`staleTime: Infinity`) and the server holds a 6h R2 cache — and `replace: true` is a
history concern, not a billing safeguard. The real race is that **filters are urgent
React state while router state transitions separately**: existing Apply and Clear already
call `state.apply/reset` and then separately reset the page
(`BacklinksFilterPanel.tsx:72-79`, `BacklinksPageSections.tsx:188-193`). A boolean gate
"released after a commit" can re-enable the stale page/view key in between.

Use **one shared row-query transaction** for all four entry points — breakdown
selection, chip removal, panel Apply, and Clear all:

- Store a transaction ID plus the **complete expected request signature** (target,
  scope, tab, view/mode, page, pageSize, sort, order, full filter payload).
- Make **one composite `navigate` call**. `handleSortingChange`
  (`BacklinksPage.tsx:95-107`) already demonstrates the single-navigation pattern.
- Release the query only when URL state *and* applied filters match the stored
  signature.
- Abort the transaction on project/target/scope change or failed navigation, so it can
  never wedge.

**Each activation must produce at most one row request.** This deserves a dedicated test,
plus one asserting a cached destination produces zero.

While a transaction is committing, temporarily disable the other breakdown actions.

### Domain expansion must be guarded at the hook, not by a prop

*(Corrected: the first draft wrongly concluded the two "cannot collide".)* Passing
`expansion={null}` only stops expansion rows from rendering
(`BacklinksPageSections.tsx:207-214`). The hook stays mounted and its `useQueries` stay
enabled with **no authorization check and no `view` check**
(`useBacklinksDomainExpansion.ts:41-65`); it requests only `{domainFrom}`, dropping every
active filter; and it retains previously expanded domains until a post-render effect
clears them on target change (`useBacklinksDomainExpansion.ts:34-39`), so navigation can
start **paid** expansions for a new target with no expand click. The grouping toggle
also remains available after a drill-down, and a later URL can default back to
one-per-domain while category filters persist.

Required:

- Make All links an invariant whenever category filters exist: hide or disable the
  grouping toggle, and clear expansions synchronously.
- At the hook: require the correct target owner, require authorization, require
  `view !== "all"`, and either propagate all applicable filters or prohibit expansion
  while any filter is active.
- `retry: 0` (covered by Phase 0 once these move to `useMeteredQuery`; these are plain
  `useQueries` today and must be fixed explicitly).

### Navigation, return, and announcements

After the final UI state commits — not after the network settles — scroll to and focus a
stable region: `role="region" aria-label="Backlink table" tabIndex={-1} scroll-mt-4
md:scroll-mt-6`, via `scrollIntoView({ block: "start" })` (smooth unless
`prefers-reduced-motion`) then `focus({ preventScroll: true })`. The app uses a nested
scroll container, so the explicit region is required. Do not focus the first data row —
it may be replaced when the response arrives.

The chip strip carries a return control at `ml-auto`: a Kumo ghost button with a bare
`ArrowUpLeft` labelled **Back to Site types** (originating card name, dynamic). It
alters no filters and fires no request; it focuses the originating row and scrolls it
into view with `block: "center"`, falling back to the section heading ("Back to
breakdowns"). Keep it even after the chip is removed; replace the origin when another
breakdown is selected; clear it on project/target/scope change.

**One live region, owned by Results**, serving both Part A's refresh and Part B's
drill-down — two "persistent" regions would double-announce. It announces loading,
success, **and failure**. On failure: set `aria-busy="false"`, announce it, preserve
focus, and expose an explicit single-request Retry (row errors currently render a Banner
with no role or live attributes, `BacklinksPageSections.tsx:196-205`).

If adding a category would exceed the 8-condition limit, apply nothing, fire nothing,
and focus an alert: *"You've reached the 8-condition limit. Remove a table filter, then
try again."*

### Zero-result precedence

Every category drill-down is also an active filter, so Part B's and Part C's empty-state
rules both match. Precedence, in order: category filter present → Part B copy with the
removable chip; manual-only filters → *"No backlinks match these filters"* + Clear
filters; page > 1 → *"No results on page {n}"* + Previous page; otherwise → *"No
backlinks found for this target"*.

## Part C — the premium finish pass

Presentation-only.

1. **Report hierarchy.** Body `flex flex-col gap-6`, sections `space-y-3` with `h2
   text-base font-semibold`. Order: **Overview** → **Backlink explorer** → **Link
   activity** → **Profile composition** → **Issues & opportunities** → **Competitive
   research**. This matches the SEO workflow and moves the explorer to where the user
   looked for it.

   Competitive research goes in a Kumo `Collapsible` **with `keepMounted`**.
   *(Corrected.)* Kumo delegates to Base UI, whose panel defaults `keepMounted` to false
   and returns `null` when closed; comparison inputs, pagination and authorizations live
   in `useBacklinksCompare` (`useBacklinksCompare.ts:41-58`), so closing would discard
   paid state and an in-flight paid request could complete into an inaccessible key.
   Alternative: hoist that state above the panel. Test close/reopen both after and
   *during* a paid lookup.

2. **Stop publishing missing data as analysis.** Normalize `label.trim()`; draw a meter
   only when at least two positive categories remain. Group the six facets into one
   `LayerCard` ("Profile composition") using Kumo `Grid variant="3up"`. Countries →
   *"Country not reported for 28 of 30 backlinks"*, with `CV`/`IN` via
   `Intl.DisplayNames`. Single-value TLD/type → a sentence, not a 100%-wide bar. A sole
   `unknown` site type → *"Site type wasn't classified for this profile"*. `anchor` as
   the only placement → *"Placement wasn't classified for this profile"* (it is not a
   semantic placement like article/footer). See Part B on aggregation: do not merge
   selectable rows.

3. **Rank the summary metrics.** Summary full-width; primary `grid-cols-2 md:grid-cols-4`
   for Backlinks, Referring domains, Referring pages, Domain authority; risk/recovery in
   a secondary row below a divider. Add `hint`/`tone` to `SummaryStat` and
   `tabular-nums`. Authority `0/100` → *"No measurable authority yet"*; broken-link
   recovery → *"None found"*; missing → `—` / *"Not available"*. Use **"Domain
   authority"** as the public term everywhere, confining "DataForSEO Domain Rank" to
   help text.

4. **One spam-score tier model.** The page uses 30, 40 and 60 in different places.
   Centralize `describeSpamScore`: `0–29` *Low signal*, `30–59` *Worth reviewing*
   (`text-warning`), `60+` *High-risk signal* (`text-error`). The observed `53` renders
   `53/100 · Worth reviewing · Review referring domains before taking action.` A score
   alone still never justifies disavowal. Fix a real zero rendering blank at
   `BacklinksTableColumns.tsx:268` — `value == null ? "—" : Math.round(value)`.

5. **Charts must detect empty *information*, not just empty arrays.** All-zero authority
   → drop the chart, show *"Domain authority stayed at 0 over this period"* under the
   stat (this is the flat line the user saw). Constant nonzero → *"held at 38 over this
   period"*, no plot. Fewer than two usable snapshots → *"Not enough history"*.

   **Do not claim this removes the timeline request.** *(Corrected.)* The three surfaces
   measure different things — `BacklinksNewLostChart` plots backlink counts
   (`BacklinksPageCharts.tsx:191-205`) while velocity and Timeline use referring-domain
   counts (`linkVelocity.ts:44-58`, `BacklinksTimelineSection.tsx:80-85`) — and overview
   history is loaded only for domain scope, with page scope getting empty trend arrays
   (`backlinksServiceData.ts:105-117`), whereas Timeline forcibly converts its target to
   domain scope and runs its own history request (`serverFunctions/backlinks.ts:180-209`).
   Date windows, ordering and missing-value semantics also differ.

   Therefore: for **domain scope**, define the date-key join, sort, null handling, series
   and axes explicitly, and only then consider dropping the extra request. For **page
   scope**, decide deliberately whether to lose the domain-level timeline or retain it.
   Consolidation is a real opportunity but it is not free, and it is not a prerequisite
   for anything else here.

6. **Fix the insight bars' degenerate cases.** Never apply the 2% minimum fill to a zero
   bucket; filter `domains === 0`. Nofollow share `0` → no bar, *"No nofollow links
   reported"*. Share `100%` → *"Every referring domain has at least one nofollow link"*
   plus *"This does not mean every link is nofollow."* Add an `insufficient` anchor
   verdict below ten mentions instead of "Natural spread".

7. **Put tab-derived cards next to their tab.** `DomainQualityCard` and `ToxicLinksCard`
   above Referring Domains; `AnchorHealthCard` above Anchors; `BrokenLinkReclaimCard`
   above Top Pages — each labelled *"Based on {n} rows on this page"*.
   `FollowSplitCard` stays in Profile composition. Never auto-open or auto-fetch a tab to
   populate them (verified: these do not auto-fetch today).

8. **Fix the guaranteed empty grid cell.** One summary surface plus three charts in three
   columns orphans Authority trend and cramps eight stats into a third of the width
   (`BacklinksOverviewPanels.tsx:77`). Separate summary from trends; `grid gap-3
   lg:grid-cols-2` with Backlink growth `lg:col-span-2`. Add `h-full` to `TrendCard`.

9. **Demote the search card after a result exists.** Keep the roomy `p-6` form only
   before a search; with an active result use a Kumo `Toolbar size="sm"` with
   `InputGroup` at `p-4`. Map scope to *Site-wide* / *Exact page*, and use `·` not `-`.

10. **One card contract.** Cards mix `rounded-xl`/`rounded-2xl`, `p-4`/`p-5`/`p-6`,
    `h2`/`h3`, `font-medium`/`font-semibold`, and description opacity `/50`,`/55`,`/60`.
    Settle on: surface `<LayerCard className="p-4">`; heading `h3 flex items-center
    gap-2 text-sm font-semibold`; description `text-xs text-base-content/55`; section
    heading `h2 text-base font-semibold`; bare `InsightIcon`, semantic color only when it
    signals status. Replace the colored error-icon tile at `BacklinksPageStates.tsx:53`
    with a bare glyph. Adopt Kumo `DropdownMenu`, `InputGroup`, `Checkbox`, structured
    `Banner`, and `Table` for the small static tables; keep TanStack `AppDataTable` for
    the explorer.

11. **Theme-safe charts.** Replace literal hex series colors with
    `var(--color-primary)`, `var(--color-base-content)`, `var(--color-success)`,
    `var(--color-error)`; use the existing `CHART_AXIS_TICK`, `CHART_X_TICK_GAP`,
    `CHART_CURSOR_LINE` and `ChartActiveDot` (Recharts hardcodes `activeDot` stroke to
    `#fff`, a known dark-mode bug here); `isAnimationActive={false}`; tokenize the tooltip.

12. **One grammar for loading / empty / zero / error.** Loaded-but-unusable → Kumo
    `Empty size="sm"` with a scoped explanation. Measured zero → a short verdict like
    *"None found"*, never an empty state. Error → structured Kumo `Banner
    variant="error"` with title, description and Retry. Loading → mirror the loaded
    geometry. Standardize `—` for missing while preserving a real `0`.

    **Always render launcher controls.** *(Corrected: "omit the card before its query
    runs" removes the button that authorizes the query.)* Compare, Competing Domains and
    Referring Networks each combine launcher and result in one card
    (`BacklinksCompareSection.tsx:29-71`). Omit only result-only content before
    authorization.

    Table empty states follow the precedence defined in Part B.

## Phases

0. **Phase 0** — `retry: 0` in `useMeteredQuery`. Blocking; pre-existing; small.
1. **Phase 1** — Part A. Smallest change that removes the reported dead end.
2. **Phase 2** — Part B. Schema + server filter builder first (unit tests on emitted
   clauses), then the transaction, then the affordance and chip strip.
3. **Phase 3** — Part C. Independent; can land incrementally. Items 1 and 2 carry most
   of the perceived gain.

## Testing

- Emitted-clause tests for all six filters: `has` for the two `array.str`, `=` for the
  four `str`, one condition each.
- A rejecting metered query invokes its `queryFn` **exactly once** (Phase 0).
- One drill-down activation issues **exactly one** row request; a cached destination
  issues **zero**.
- Condition-budget: a 9th condition applies nothing and fires nothing.
- Mounting Part A's not-loaded state fires **no** request.
- Domain expansion fires nothing when unauthorized, when `view === "all"`, or for a
  stale target after navigation.
- Non-selectable rows are not buttons and not in the tab order.
- Degenerate rendering: blank label, single-category list, all-zero series.
- Collapsible close/reopen during an in-flight paid compare lookup.
- Both themes for chips, meters and charts.

## Found in passing — real defects, not fixed here

1. **`status="lost"` cannot work.** Every rows request hardcodes
   `backlinks_status_type: "live"` (`backlinks.ts:180`), so asking for lost links sends
   `live` plus `is_lost=true`.
2. **Condition budget can be exceeded on spam-enabled paths.** The spam clause is
   appended *after* `assertFilterConditionBudget`, so 8 user conditions become 9
   outgoing. MCP defaults `hideSpam` true; the web page sets `hideSpam: false` and is
   unaffected.
3. **Client/server disagree on condition count** for `{status:"lost", hideLost:true}` —
   client counts two, server emits one.
4. **Offset ceiling.** DataForSEO caps offset at 20,000 and this code never uses
   `search_after_token`, so large profiles cannot be traversed past roughly page 101
   (size 200) / 201 (size 100) / 401 (size 50).
