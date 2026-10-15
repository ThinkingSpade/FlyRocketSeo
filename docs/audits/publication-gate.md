# Audit-branch publication and external Cloudflare gate

Date: 2026-10-13. Branch: `audit/flyrocketseo-reliability-2026-10-13`.

## Approved release on 2026-10-13

The user subsequently requested **"lets get it deployed"**, authorizing
publication and deployment of the completed repairs. Commit
`2d2676f3b0c0948d79ca9f54718bd445221a15c0` was pushed to the existing audit
branch; no merge or main-branch change occurred. The earlier publication hold
below is historical for this approved release.

Fresh release checks pass: 3,825 native tests in 398 files, full repository
static checks with zero lint warnings/errors, production build/root prerender,
SPA shell/startup guard and Wrangler 4.105 deployment dry run. Application and
test source exactly matches the prior complete 83-case authenticated browser run
at `ff2e0530`; subsequent differences are documentation and CI metadata.

Production D1 migration metadata revealed six unapplied committed migrations:
`0044_omniscient_kree.sql`, `0045_fat_bloodaxe.sql`,
`0046_flashy_corsair.sql`, `0047_evidence_storage_fences.sql`,
`0048_rank_observation_scope.sql`, `0049_rank_keyword_metric_scope.sql`.
Independent review and read-only schema checks found no conflicts. They only
create tables/indexes or add columns, with no deletion, backfill or reset.
The pre-migration D1 Time Travel bookmark was retained. All six applied through
the standard migration command; the verified ledger contains all 50 committed
files plus three pre-existing harvest migrations, 53 entries total, zero pending.
The older harvest entries and tables were retained.

The completed Cloudflare check links the exact release commit to build
`33d5a35a-a641-491c-9e07-69c1124e788b` and version
`f6e341e3-0c11-45af-ba97-aa59c0da18af` (number 376). Direct deployment metadata
confirms **100% production traffic**, deployment
`dc6e34f4-ac12-45d8-ba3a-f275137b4b33`, created
`2026-10-13T21:23:14.67733Z`. Binding identities and the hosted auth-mode setting
match the pre-release snapshot. Prior code version:
`564c8597-8986-476f-a5db-a7946411248d`; code rollback would not undo D1 changes.

Production URL: [FlyRocketSEO](https://flyrocketseo.huy1999nguyen.workers.dev).
GET-only checks return 200 for the home/sign-in shells, referenced client module,
anonymous auth session (`null`) and OAuth discovery with the matching issuer.
The settled browser sign-in screen and email form render with no console errors;
no credentials, account creation or form submission was used. The first
post-reload selector wait timed out while the screen was loading; the subsequent
state inspection and form interaction passed. Loading performance is not certified.

Exact-source [Docker PostgreSQL CI](https://github.com/ThinkingSpade/FlyRocketSeo/actions/runs/38469932593)
passes 17 cases in four files, all 24 migrations apply/replay, PostgreSQL 17.11.
Selected hidden runtime metadata is now present in its archived artifact.
The [audit CI](https://github.com/ThinkingSpade/FlyRocketSeo/actions/runs/38469932600)
is still running; its final result is not inferred from local or earlier CI passes.

Live authenticated provider/OAuth, GBP/Sheets and deployed job/storage acceptance
remain blocked without test-account access. No real paid provider request or new
paid service was introduced. Ignored release evidence is preserved under
`.logs/evidence/release-2d2676f3/` and `.logs/release-*`.

## Earlier observed events (historical)

The tested source was pushed to the existing audit branch at approximately
18:03 UTC, advancing `f28cfe15` to `3ece2362`. No PR, merge, deployment command,
production migration command or paid provider request was issued. Both tracked
GitHub workflows perform verification only.

Those exact-source workflows pass: [audit verification](https://github.com/ThinkingSpade/FlyRocketSeo/actions/runs/38443618376)
and [isolated PostgreSQL](https://github.com/ThinkingSpade/FlyRocketSeo/actions/runs/38443618773).
Their logs and artifacts confirm 3,780 native tests, 82 application cases,
20 controlled contracts, static/build checks, and 17 PostgreSQL cases with all
24 migrations. Later source repairs require their own verification; these passes
are not relabelled as a run of unpublished changes.

The previous audit-branch Cloudflare check was skipped. That historical result
did not establish the external trigger's behavior for this new source push.
Its commit message began `[CF-Pages-Skip] [skip ci]`; the skipped check therefore
could not establish that the audit branch was excluded from builds. This
publication should have verified the external trigger before pushing.
The new check associates `3ece2362` with Cloudflare build
`6abc1857-7934-4eb4-9602-0b66bbf2d11e`. The initial in-progress check was
superseded by completed successful check `115458132363`, inspected at
18:59 UTC; its output explicitly names version
`564c8597-8986-476f-a5db-a7946411248d`.
GitHub returned no deployment records, but this is insufficient evidence about
Cloudflare deployments.

Direct read-only Cloudflare Worker metadata reports a new 100% deployment:

- Worker: `flyrocketseo`.
- Deployment: `c6966aa7-cda8-4761-9a7e-5dc1931c7526`.
- Created: `2026-10-13T18:07:14.581434Z`.
- Version: `564c8597-8986-476f-a5db-a7946411248d`, number 375.
- Version created: `2026-10-13T18:07:10.766644Z`; source `wrangler`;
  `has_preview: false`.

The deployed code contains the audit's late Trends guard and 36 modules match
the local verified production build. Although version annotations contain no
commit/build ID, the completed GitHub check now establishes the exact audit
commit/build/version linkage. Combined with direct 100% deployment metadata,
this confirms an automatic production deployment following the audit push.
The user subsequently answered the pending deployment question: **"Yes, it was
intentional."** The observed deployment is therefore recorded as intentional,
and that question is closed. No rollback was requested. The reply concerns this
existing deployment; publication or deployment of later local repairs still
requires approval. Production data/migration effects remain uninspected.

## Earlier publication hold and follow-up (historical)

The final local roadmap repairs are committed and verified. Further remote
pushes await approval for their Cloudflare deployment effect or a verified
nondeploying publication path. No rollback, trigger edit, token-scope change,
production data repair, production database inspection or live workflow test is
performed.

The existing Wrangler OAuth profile can read Worker metadata and code, but
Cloudflare rejects Builds logs/trigger reads and cancellation with HTTP 403.
One cancellation attempt targeted only the exact verified audit build; it failed
with an authentication error and made no successful change. This is a Cloudflare
permission failure, not an automatic approval-review rejection.

Before publishing more source, verify the Cloudflare branch filters and build,
preview and deployment commands. Verification-only publication requires a path
that does not deploy; publishing through the existing deployment trigger needs
explicit approval for the new source. Configuration changes and recovery actions
require their own approval. A Worker code rollback would not establish that
connected data or migrations were rolled back.

Cloudflare documents commit-message skip flags for Pages, but the inspected
Workers Builds documentation does not establish the same guarantee for this
Worker. No further push will rely on an unverified skip flag. Locally committed
repairs remain unpublished until a safe publication path is established.

Existing staging/OAuth/provider access remains unavailable. The observed Worker
deployment and read-only metadata access do not certify live application,
provider, R2, Hyperdrive, job recovery or migration correctness.

Ignored evidence: `.logs/evidence/ci-3ece2362/` and
`.logs/cloudflare-build-readonly/`. Credentials remain outside committed source;
the code comparison stores only module hashes/flags, not downloaded Worker source.

Primary operational references: [Cloudflare build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
and [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).
