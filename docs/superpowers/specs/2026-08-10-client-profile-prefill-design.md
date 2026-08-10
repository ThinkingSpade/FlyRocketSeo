# Client profile: pre-filled, geographically honest, and actually used

Date: 2026-08-10
Status: approved, unimplemented

## The problem

`ProjectProfileCard` — "About this client", on Keyword Research — is a blank
form. Everything it asks for is either already known to the app or readable
from the client's own site, and it asks anyway.

Three specific failures:

1. **Nothing pre-fills.** The card opens empty on every project, so the tab
   that most needs the profile is also the tab that makes you type it.
2. **"Where do they sell?" never names a place.** It records the _shape_ of a
   service area (`local` / `regional` / `national` / `global`) and nothing
   else, while the project's actual city sits in `project_target_areas`,
   detected and displayed by `TargetAreaBanner` directly above it. A DFW
   vending operator sees "Nationwide" selected by default and no mention of
   Dallas anywhere in the card that decides whether their seed keywords carry
   a geo modifier.
3. **"Draft this from their site" does nothing when clicked.** No pending
   state, no error. The feature was verified live on 2026-07-29 and has
   regressed since.

And the profile it produces feeds only Keyword Research and Trends, though
five other surfaces would be better for knowing what the client sells.

## Why drafting could regress unnoticed

`useClientRuntimeConfigQuery` (`src/client/features/auth/useEmailVerificationBypassed.ts`)
is declared `enabled: isHostedMode`. Under `AUTH_MODE=local_noauth` the query
never runs, so its `initialData` — deliberately all-`false`, which is the right
default for a _gate_ — is the only value `aiExplainAvailable` ever sees.

The consequence is not a gate that fails closed. It is that **every
AI-gated affordance is invisible in local development regardless of whether
`OPENROUTER_API_KEY` is set**: the draft button, the semantic fit pass, and
GBP writing. A developer running the app locally cannot see, let alone click,
the button this spec is about. That is the mechanism by which a working
feature became a broken one with nobody noticing.

Fixing this is Phase 1 and blocks the rest, because Phase 2 automates the
very call that is currently broken.

## Phase 1 — Make drafting work

### 1a. Resolve AI capability in every auth mode

Run the client-runtime-config query unconditionally rather than only under
hosted auth. One query, one cache entry, as today.

`useEmailVerificationBypassed` keeps its resolution formula **byte-for-byte
unchanged** (`!isHostedMode || source === "runtime"`), so hosted auth route
guards cannot regress on the back of this change. Only `useAiExplainAvailable`
and `useGbpWriteAvailable` adopt the stricter `source === "runtime"` test,
which is what they always should have used: their whole purpose is to reflect
the live Worker environment, and a placeholder is not that.

### 1b. Root-cause the click

Reproduce in a browser with the button now reachable in local dev, and fix
the actual cause. The reported symptom — the label never changes to "Reading
the site…" — points at the click path rather than the server, since a server
failure would render a pending state first and error text after.

No fix is specified here on purpose. The cause will be established by
observation (console, network, React state), not by inference, and a
regression test will pin whatever it turns out to be.

### Not in scope: error copy

PR #41 (`fix/profile-draft-error-messages`) already rewrites the drafting
error messages and the un-started empty state. This spec does not touch that
work; the two branches overlap on `ProjectProfileCard.tsx` and will be
reconciled when one of them merges.

## Phase 2 — Pre-fill

### 2a. Free pre-fill, before any model runs

On open, with zero API calls, seeded from data the app already holds:

- **`serviceAreaKind`** from the project's target area — confirmed if there is
  one, otherwise the proposal the detection cascade already computes for the
  banner. `city` / `metro` → `local`, `region` → `regional`, `country` →
  `national`. A project with no signal at all keeps today's `national`
  default.
- **`brandTerms`** from the project name and the domain's root label,
  de-duplicated case-insensitively.

These are draft values in an unsaved form: the pre-fill itself writes nothing
to `project_profiles`, exactly as today. (Phase 2c writes a row, and the
picker in 2b writes a target area — both on an explicit trigger, neither on
mere pre-fill.)

**The target area wins over the model.** Where a geo signal exists — confirmed
or proposed — it decides `serviceAreaKind`, and the drafted `serviceAreaKind`
is discarded. A model reading marketing copy guesses at reach; the detection
cascade reads GBP and Search Console. The model's guess is used only when
there is no geo signal at all.

### 2b. Name the place

Under "Where do they sell?", render the target area's own label — "Dallas–Fort
Worth TX" — with the existing `GeoLocationSelect` picker to change it, writing
through `useSetTargetArea`. A multi-area GSC proposal lists the cities it found
and lets the user promote one to primary.

**Geography is not copied onto `project_profiles`.** The schema comment at
`src/db/app.schema.ts` is right that two stores for one fact would drift;
`serviceAreaKind` stays a shape, and the card reads and writes the coordinates
through the table that already owns them. What changes is that the card stops
pretending the shape is the whole answer.

Storing several _confirmed_ areas per project is out of scope. The table models
it (`isPrimary` on a per-project row set), but no write path exists, and the
multi-area proposal above covers the case that motivated the request.

### 2c. Auto-draft, once per project

When a project has a domain, has no `project_profiles` row, and drafting is
available, the card drafts from the site on first open.

The endpoint **claims the row before crawling**: it inserts the profile row
with `source: "ai"`, `draftedAt` set and `confirmedAt: null` up front, then
fills it in. Two consequences, both load-bearing:

- Mounting the card on five tabs (Phase 3) cannot fire five concurrent
  drafts — later callers see the row and skip.
- A site that cannot be read leaves a claimed, empty `ai` row, so a failed
  draft is remembered as an attempt rather than re-crawled on every page load.
  The manual button remains the way to retry.

The card opens in a review state naming the source: "Drafted from
deliotx.com — check this and save."

**An unconfirmed draft does not classify keywords.** `confirmedAt: null` means
proposal, per the contract `project_profiles` was built on, and a hallucinated
exclusion line silently demoting real keywords is a worse failure than a
one-click confirmation. Save is what turns the profile on.

Cost: one OpenRouter call and a capped five-page crawl, once per project, ever.
No metered SEO provider is reachable from this path.

## Phase 3 — Feed it everywhere

Each item is independent of the others and can ship on its own.

- **Reachable everywhere.** The collapsed one-line summary already built into
  `ProjectProfileCard` mounts on Content Optimizer, Topic Clusters,
  Opportunities and SAM. One record, edited wherever the user notices it is
  wrong.
- **Content Optimizer and Topic Clusters** consume `offer` / `customer` /
  `exclusions` through the same `useKeywordFit` classifier Keyword Research
  uses, so cluster suggestions and briefs inherit the same verdicts.
- **SAM** receives the profile in `buildSamSystemPrompt`, which today knows
  only project name, domain and market. Brand-visibility prompts receive the
  offer and brand terms.
- **Client Report** opens with who the client is rather than a bare domain.

## Testing

- `useAiExplainAvailable` / `useGbpWriteAvailable` resolve from runtime data in
  both auth modes; `useEmailVerificationBypassed` behaviour is pinned unchanged
  in both.
- A regression test for whatever Phase 1b turns out to be.
- Pure mapping from `TargetArea.kind` to `ServiceAreaKind`, and brand-term
  derivation from name + domain, both tested as functions rather than through
  the component.
- Concurrent auto-draft calls produce exactly one crawl.
- A failed draft does not re-crawl on the next mount.
- Fit classification stays empty while `confirmedAt` is null.
