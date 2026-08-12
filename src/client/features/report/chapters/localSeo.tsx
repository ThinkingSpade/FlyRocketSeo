import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table } from "@cloudflare/kumo/components/table";
import { getProjects } from "@/serverFunctions/projects";
import { getCachedBusinessContext } from "@/serverFunctions/local-seo";
import { getGbpConnection, listGbpScheduledPosts } from "@/serverFunctions/gbp";
import {
  buildGbpAudit,
  toGbpAuditInput,
  type GbpCheck,
  type GbpCheckStatus,
} from "@/client/features/local-seo/gbpAudit";
import {
  orderChecksForDisplay,
  scoreBasisHint,
} from "@/client/features/local-seo/gbpAuditDisplay";
import {
  dropReason,
  formatDay,
  listingView,
  postsView,
  type ListingOnFile,
  type LocalSeoPost,
  type LocalSeoProfile,
  type LocalSeoReads,
  type localSeoReportData,
  type PostsView,
} from "@/client/features/report/chapters/localSeoViews";
import { ReportHeroStats } from "@/client/features/report/ReportChrome";
import { Section, Tile } from "@/client/features/report/ReportPrimitives";
import { formatCount } from "@/client/features/report/reportModel";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * The Local presence chapter: the client's Google Business Profile as it stood
 * when we last read it, and anything published to that listing this period.
 *
 * Two sources, both free. The listing half is the snapshot
 * `getCachedBusinessContext` kept from the last (metered) Local SEO lookup —
 * the report never calls `getBusinessProfile`, which is the paid one. The posts
 * half is a plain D1 read of `gbp_scheduled_posts`. Every query key here is
 * the key its own tab already uses, so once Local SEO has been opened this
 * chapter costs the report nothing.
 *
 * Two things this chapter must never do:
 *
 * 1. Claim the listing is monitored. The snapshot carries a single `fetchedAt`
 *    and has no previous-period counterpart, so the listing half says "as of
 *    <date>" and nothing else. Only the posts half is period-filterable.
 * 2. Claim the listing is the client's without checking. The cache is keyed by
 *    org+project but written for whatever business was last typed into the
 *    Local SEO tab's free-text box, so one competitor lookup would otherwise
 *    print a rival's rating, review count and photo tiles under the title
 *    "Your Google Business Profile". A listing whose own website is a
 *    different host than this project's domain is withheld, with the reason
 *    printed — see `describeOtherListing`.
 *
 * The wording every one of those rules produces — and the view resolution that
 * decides which half of the sheet may speak — lives in `localSeoViews.ts`;
 * this file holds the reads and the printed page.
 */

/** Matches ReportChrome's paragraph ink. Copied rather than imported from
 *  `reportChapters` so this module keeps no runtime edge back to the file that
 *  imports it — `import/no-cycle` is an error in this repo. */
const CHAPTER_BODY = "#2f3a49";

const STALE_TIME = 10 * 60_000;

// ---- Data ---------------------------------------------------------------

/** Narrows the cached context down to the fields this chapter prints, so the
 *  chapter's own data shape stays independent of the service's wider profile
 *  type (and of anything the service adds to it later). */
function profileOf(
  context: { profile: LocalSeoProfile } | null | undefined,
): LocalSeoProfile | null {
  return context?.profile ?? null;
}

/** The cover prints the calendar month the report was generated in
 *  (`ClientReportPage`'s `periodLabel`), so "this period" here is that month —
 *  a rolling 28-day window would silently disagree with the cover and nothing
 *  on the sheet would let the client notice. Memoised so the window cannot
 *  slide between two renders of one sheet. `end` is exclusive. */
function reportPeriod(): { start: string; end: string; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: start.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }),
  };
}

export function uselocalSeoReportData(projectId: string): localSeoReportData {
  // Same key the rest of the app uses for the project list, so this costs no
  // extra fetch. The domain decides two things: whether the audit's website
  // check can run, and whether this chapter may call the listing the client's.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: STALE_TIME,
  });
  // Identical key to LocalProjectContext's. FREE: the handler is a single R2
  // read behind `requireProjectContext` and never builds a DataForSEO client.
  const businessQuery = useQuery({
    queryKey: ["cached-business-context", projectId],
    queryFn: () => getCachedBusinessContext({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  // Both keys below are the ones GbpWriteSection and GbpScheduledPostsList
  // already use; both handlers are plain D1 reads.
  const connectionQuery = useQuery({
    queryKey: ["gbpConnection", projectId],
    queryFn: () => getGbpConnection({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const postsQuery = useQuery({
    queryKey: ["gbpScheduledPosts", projectId],
    queryFn: () => listGbpScheduledPosts({ data: { projectId } }),
    staleTime: STALE_TIME,
  });

  const period = useMemo(reportPeriod, []);

  return {
    profile: profileOf(businessQuery.data),
    domain:
      projectsQuery.data?.find((entry) => entry.id === projectId)?.domain ??
      null,
    connected: connectionQuery.data?.connected === true,
    posts: (postsQuery.data ?? []).map(
      (post): LocalSeoPost => ({
        id: post.id,
        content: post.content,
        scheduledAt: post.scheduledAt,
        status: post.status,
      }),
    ),
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: period.label,
    readFailures: {
      projects: projectsQuery.isError,
      localBusiness: businessQuery.isError,
      gbpConnection: connectionQuery.isError,
      gbpPosts: postsQuery.isError,
    } satisfies LocalSeoReads,
    pendingReads: {
      projects: projectsQuery.isLoading,
      localBusiness: businessQuery.isLoading,
      gbpConnection: connectionQuery.isLoading,
      gbpPosts: postsQuery.isLoading,
    } satisfies LocalSeoReads,
  };
}

// ---- Presentation -------------------------------------------------------

const STATUS_WORD: Record<GbpCheckStatus, string> = {
  pass: "Good",
  warn: "Needs work",
  fail: "Missing",
  unknown: "Not visible",
};

/** The report has no path to review text — the reviews task id lives in the
 *  Local SEO tab's localStorage — so the owner-response check would print
 *  "Not visible" on every sheet forever, and drag `scoreBasisHint` down to a
 *  permanent "9 of 10 checks evaluated". A row that can never say anything is
 *  padding; it stays on the tab, where it can actually be filled in. */
export function reportableChecks(checks: GbpCheck[]): GbpCheck[] {
  return orderChecksForDisplay(checks).filter(
    (check) => check.key !== "ownerResponse",
  );
}

function BodyText({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed" style={{ color: CHAPTER_BODY }}>
      {children}
    </p>
  );
}

/** "—" unless both fields came back, matching this tile row's three siblings
 *  and the audit's core rule: a null field means the source did not return it,
 *  not that the business left it blank. "0/2" over a checks table that says
 *  "No logo data is available for this profile" is the sheet contradicting
 *  itself. */
export function photoCount(profile: LocalSeoProfile): string {
  if (profile.logo == null || profile.mainImage == null) return "—";
  const set = [profile.logo, profile.mainImage].filter(
    (value) => value.trim() !== "",
  ).length;
  return `${set}/2`;
}

function ProfileTiles({ profile }: { profile: LocalSeoProfile }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Reviews" value={formatCount(profile.reviewsCount)} />
      <Tile
        label="Claimed"
        value={
          profile.isClaimed == null ? "—" : profile.isClaimed ? "Yes" : "No"
        }
      />
      <Tile
        label="Extra categories"
        value={
          profile.additionalCategories == null
            ? "—"
            : String(profile.additionalCategories.length)
        }
      />
      <Tile label="Photos" value={photoCount(profile)} />
    </div>
  );
}

function ChecksTable({ checks }: { checks: GbpCheck[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Check</Table.Head>
            <Table.Head>What we found</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Recommended fix</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {checks.map((check) => (
            <Table.Row key={check.key}>
              <Table.Cell>{check.label}</Table.Cell>
              <Table.Cell className="max-w-xs">{check.detail}</Table.Cell>
              <Table.Cell>{STATUS_WORD[check.status]}</Table.Cell>
              <Table.Cell className="max-w-xs">{check.fix ?? "—"}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

function PostsTable({ posts }: { posts: LocalSeoPost[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            {/* Not "Published": the row carries no publication time, only the
                day it was scheduled for. */}
            <Table.Head>Scheduled for</Table.Head>
            <Table.Head>Post</Table.Head>
            <Table.Head>Status</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {posts.map((post) => (
            <Table.Row key={post.id}>
              <Table.Cell className="whitespace-nowrap">
                {formatDay(post.scheduledAt) ?? "—"}
              </Table.Cell>
              <Table.Cell className="max-w-md">
                <span className="line-clamp-1">{post.content}</span>
              </Table.Cell>
              <Table.Cell>Published</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

function PostsSection({
  view,
  periodLabel,
}: {
  view: PostsView;
  periodLabel: string;
}) {
  if (view.kind === "hidden") return null;
  return (
    <Section
      title="Posts published to your listing"
      subtitle={`Google Business Profile updates published for ${periodLabel}, dated by the day each post was scheduled for — the moment a post goes live is not recorded.`}
    >
      {view.kind === "table" ? (
        <PostsTable posts={view.posts} />
      ) : (
        <BodyText>{view.text}</BodyText>
      )}
    </Section>
  );
}

// ---- Chapter ------------------------------------------------------------

function heroItems(
  profile: LocalSeoProfile,
  score: number | null,
): Array<{ label: string; value: string }> {
  return [
    { label: "Profile score", value: score == null ? "—" : `${score}/100` },
    {
      label: "Star rating",
      value: profile.rating == null ? "—" : profile.rating.toFixed(1),
    },
  ];
}

function ListingBlock({
  listing,
  domain,
}: {
  listing: ListingOnFile;
  domain: string | null;
}) {
  const audit = buildGbpAudit(
    toGbpAuditInput(listing.profile, domain, undefined),
  );
  const checks = reportableChecks(audit.checks);
  return (
    <>
      <ReportHeroStats items={heroItems(listing.profile, audit.score)} />
      {/* Names the listing this was read from, not just the date: the snapshot
          is whatever business was last looked up on the Local SEO tab. */}
      <BodyText>{listing.provenance}</BodyText>
      {listing.domainNote ? <BodyText>{listing.domainNote}</BodyText> : null}
      <ProfileTiles profile={listing.profile} />
      <Section
        title="Profile checks"
        subtitle={
          scoreBasisHint(checks) ?? "Every field on your listing we could read."
        }
      >
        <ChecksTable checks={checks} />
      </Section>
    </>
  );
}

function chapterSpec(body: ReactNode): ReportPageSpec {
  return {
    key: "local-seo",
    // Renumbered by whoever assembles the full chapter list — this file does
    // not know which numbers its neighbours took.
    number: "06",
    kicker: "Local presence",
    title: "Your Google Business Profile",
    body,
  };
}

/**
 * Adds the chapter when there is something on it, or drops it with the reason
 * a client can act on.
 *
 * Admitted on a listing we can call this project's, or on at least one post
 * published inside the period. Nothing else earns a sheet: without either,
 * this chapter is a heading and an apology.
 */
export function buildlocalSeoChapter(
  data: localSeoReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  void sections;
  const title = "Your Google Business Profile";
  const listing = listingView(data);
  const posts = postsView(data);

  if (listing.kind !== "listing" && posts.kind !== "table") {
    out.drop(title, dropReason(data, listing, posts));
    return;
  }

  out.add(
    chapterSpec(
      <>
        {listing.kind === "listing" ? (
          <ListingBlock listing={listing} domain={data.domain} />
        ) : null}
        {/* A listing we could not tie to this project is named, not silently
            dropped: the posts below are still the client's own. */}
        {listing.kind === "other" ? <BodyText>{listing.text}</BodyText> : null}
        <PostsSection view={posts} periodLabel={data.periodLabel} />
      </>,
    ),
  );
}
