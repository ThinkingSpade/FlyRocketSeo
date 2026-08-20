import type { GbpAuditInput } from "@/client/features/local-seo/gbpAudit";

/**
 * What each half of the Local presence sheet is allowed to say, split out of
 * `localSeo.tsx` once that file crossed this repo's `max-lines` cap. Same
 * chapter, split at the seam that was already there: everything here is pure
 * wording and view resolution over the chapter's four reads, so the `.tsx`
 * side keeps only the queries and the printed components.
 *
 * The rules these functions exist to hold are the chapter's, unchanged:
 *
 * 1. Never claim the listing is monitored. The snapshot carries a single
 *    `fetchedAt` and has no previous-period counterpart, so the listing half
 *    says "as of <date>" and nothing else. Only the posts half is
 *    period-filterable.
 * 2. Never claim the listing is the client's without checking — see
 *    `describeOtherListing`.
 */

/** Exactly the profile fields this chapter reads. Derived from the audit's own
 *  input type so the two can never drift apart, plus the two fields the audit
 *  has no use for but a printed sheet does: who the listing is for, and when we
 *  read it. */
export type LocalSeoProfile = Omit<GbpAuditInput, "domain" | "reviews"> & {
  title: string | null;
  fetchedAt: string;
};

export type LocalSeoPost = {
  id: string;
  content: string;
  scheduledAt: string;
  status: string;
};

/** Per-read state for this chapter's four reads, used for both "threw" and
 *  "still in flight". Per-read rather than one flag: a sentence that names the
 *  wrong read is as wrong as one that names none, and "still loading" about a
 *  lookup that already came back empty buries the reason the client can act
 *  on. */
export type LocalSeoReads = {
  projects: boolean;
  localBusiness: boolean;
  gbpConnection: boolean;
  gbpPosts: boolean;
};

type ReadKey = keyof LocalSeoReads;

/** Everything the sheet is built from. Named here rather than inferred from
 *  the hook so the wording below does not have to import back across the
 *  split — `uselocalSeoReportData` returns exactly this. */
export type localSeoReportData = {
  profile: LocalSeoProfile | null;
  domain: string | null;
  connected: boolean;
  posts: LocalSeoPost[];
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  readFailures: LocalSeoReads;
  pendingReads: LocalSeoReads;
};

// ---- State sentences ----------------------------------------------------

const NEVER_RUN =
  "No Google Business Profile lookup is on file for this project. Saved lookups are kept for a limited window, so one run earlier in the period may no longer be on file — re-running the Local SEO lookup restores this chapter.";

/** A lookup that is on file and reports no listing is a real answer, not an
 *  absence — today the cache only stores found profiles so this is unreachable,
 *  but the day that gate moves, the sheet must not say "no lookup is on file"
 *  about a lookup that ran. */
const NOT_FOUND =
  "The Google Business Profile lookup on file found no listing for this business.";

/** Named by the month on the cover, never "this period" — and dated by the day
 *  each post was scheduled for, because that is the only date the row carries
 *  (`gbp_scheduled_posts` has no published-at column and `markPublished` writes
 *  none, so a post published early via "Publish now" still carries its future
 *  scheduled date). */
function noPostsIn(periodLabel: string): string {
  return `No posts scheduled for ${periodLabel} have been published to your Google Business Profile.`;
}

/** Client-facing names for each read, in the vocabulary `reportReads`'
 *  `READ_SUBJECTS` uses — `projects` is that file's own wording, verbatim, so
 *  a failed project read reads the same here as it does on the cover sheet. */
const READ_SUBJECTS: Record<ReadKey, string> = {
  localBusiness: "the saved Google Business Profile lookup",
  projects: "this project's own record",
  gbpConnection: "the Google Business Profile connection",
  gbpPosts: "the Google Business Profile posting history",
};

/** Listed rather than derived from the record's keys so the order a combined
 *  sentence names them in is deliberate: the lookup is the one a client can act
 *  on, so it leads. */
const READ_ORDER = [
  "localBusiness",
  "projects",
  "gbpConnection",
  "gbpPosts",
] as const satisfies ReadonlyArray<ReadKey>;

function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function joinSubjects(keys: readonly ReadKey[]): string {
  const subjects = keys.map((key) => READ_SUBJECTS[key]);
  if (subjects.length === 1) return subjects[0];
  return `${subjects.slice(0, -1).join(", ")} and ${subjects[subjects.length - 1]}`;
}

/** The reads in `scope` that are flagged, in READ_ORDER. Scoped on purpose:
 *  the posts section may only speak for the posts read, never for a read that
 *  belongs to another half of the sheet. */
function readsIn(reads: LocalSeoReads, scope: readonly ReadKey[]): ReadKey[] {
  return READ_ORDER.filter((key) => scope.includes(key) && reads[key]);
}

/** Null when nothing in `keys` failed, so callers can `??` through to their
 *  ordinary "nothing to show" sentence — the failure always outranks it.
 *  Byte-identical template to `describeFailedReads` in `reportReads.ts`. */
function describeFailed(keys: readonly ReadKey[]): string | null {
  if (keys.length === 0) return null;
  return `${sentenceCase(joinSubjects(keys))} could not be read while this report was generated — ${
    keys.length === 1 ? "that request" : "those requests"
  } failed rather than returning nothing.`;
}

/** Same template as `describeSnapshotGap`'s in-flight sentence. A read still
 *  in flight is neither present nor absent, and this page can be printed
 *  mid-load. */
function describePending(keys: readonly ReadKey[]): string | null {
  if (keys.length === 0) return null;
  return `${sentenceCase(joinSubjects(keys))} ${
    keys.length === 1 ? "was" : "were"
  } still loading when this report was generated.`;
}

/** Shared with the printed side: the provenance line and the posts table date
 *  the same way, so they cannot disagree about a day. */
export function formatDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---- Whose listing is this ----------------------------------------------

function parseHost(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The host a URL resolves to, without `www.`. Read off the listing's `url`
 *  rather than the profile's own `domain` field on purpose: `toGbpAuditInput`
 *  omits that field precisely so no caller can compare the listing to itself. */
function hostOf(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return null;
  const host = parseHost(trimmed) ?? parseHost(`https://${trimmed}`);
  return host == null ? null : host.replace(/^www\./, "");
}

/** True only when both hosts are readable and identical. "Cannot tell" is
 *  never a match — this decides whether the sheet may say "your profile". */
function matchesProject(
  profile: LocalSeoProfile,
  domain: string | null,
): boolean {
  const listed = hostOf(profile.url);
  const project = hostOf(domain);
  return listed != null && project != null && listed === project;
}

/** Non-null when the listing on file positively belongs to some other site.
 *  The listing is then withheld rather than printed as the client's: the
 *  Local SEO keyword is free text, so the cache holds whichever business was
 *  looked up last, and a printed sheet cannot be taken back. A listing that
 *  legitimately links a booking or landing page lands here too — hence the
 *  sentence states the two hosts instead of accusing anyone. */
export function describeOtherListing(
  profile: LocalSeoProfile,
  domain: string | null,
): string | null {
  const listed = hostOf(profile.url);
  const project = hostOf(domain);
  if (listed == null || project == null || listed === project) return null;
  return `The Google Business Profile lookup on file is for ${
    profile.title ?? "another business"
  }, whose listed website is ${listed} — not this project's domain (${project}). This report could not confirm that listing belongs to this project, so the listing was left out rather than presented as yours.`;
}

function describeProvenance(
  profile: LocalSeoProfile,
  domain: string | null,
): string {
  const day = formatDay(profile.fetchedAt);
  const named = profile.title ? ` for ${profile.title}` : "";
  const on = day ? ` on ${day}` : "";
  if (matchesProject(profile, domain)) {
    return `Read from your Google Business Profile${named}${on}.`;
  }
  return `Read from the Google Business Profile listing${named}${on}. Nothing on file ties that listing to this project's domain, so confirm it is the right business before acting on the fixes below.`;
}

// ---- What each half of the sheet may say --------------------------------

export type ListingOnFile = {
  kind: "listing";
  profile: LocalSeoProfile;
  provenance: string;
  /** Names the failed/in-flight project read when the website check could not
   *  be run, so the "Not visible" row below has a stated cause. */
  domainNote: string | null;
};

// Not exported: the chapter gets this type by inference from `listingView`,
// so naming it across the boundary only creates a second thing to keep in step.
type ListingView =
  | ListingOnFile
  | { kind: "other"; text: string }
  | { kind: "none" };

export type PostsView =
  | { kind: "table"; posts: LocalSeoPost[] }
  | { kind: "note"; text: string }
  | { kind: "hidden" };

export function listingView(data: localSeoReportData): ListingView {
  const profile = data.profile;
  const found = profile?.found === true ? profile : null;
  if (!found) return { kind: "none" };
  const other = describeOtherListing(found, data.domain);
  if (other) return { kind: "other", text: other };
  return {
    kind: "listing",
    profile: found,
    provenance: describeProvenance(found, data.domain),
    domainNote:
      describeFailed(readsIn(data.readFailures, ["projects"])) ??
      describePending(readsIn(data.pendingReads, ["projects"])),
  };
}

function publishedInPeriod(data: localSeoReportData): LocalSeoPost[] {
  const start = new Date(data.periodStart).getTime();
  const end = new Date(data.periodEnd).getTime();
  return data.posts.filter((post) => {
    if (post.status !== "published") return false;
    const at = new Date(post.scheduledAt).getTime();
    return !Number.isNaN(at) && at >= start && at < end;
  });
}

/**
 * Posts we successfully read are shown whatever the connection read did — they
 * are rows on this project, and a listing published to in April is published to
 * in April whether or not the write integration answers today. Only the *empty*
 * note is gated on a connected listing: telling a client who never set posting
 * up that they published nothing is a sales pitch in a deliverable.
 */
export function postsView(data: localSeoReportData): PostsView {
  const failed = describeFailed(readsIn(data.readFailures, ["gbpPosts"]));
  if (failed) return { kind: "note", text: failed };
  const pending = describePending(readsIn(data.pendingReads, ["gbpPosts"]));
  if (pending) return { kind: "note", text: pending };
  const posts = publishedInPeriod(data);
  if (posts.length > 0) return { kind: "table", posts };
  if (data.connected)
    return { kind: "note", text: noPostsIn(data.periodLabel) };
  return { kind: "hidden" };
}

/**
 * Why the listing half has nothing on it, in the order a client can act on:
 * a failed read first, then an in-flight one, then what the lookup actually
 * said.
 *
 * Printed in two places, and deliberately the same sentence in both. It is the
 * listing half of `dropReason` when the chapter is left out, and it is the
 * paragraph the sheet prints in place of the profile when the chapter was
 * admitted on posts alone — a single published post used to be enough to earn a
 * sheet headed "Your Google Business Profile" that held nothing but a posts
 * table, with the failed lookup stated neither on the sheet nor on the coverage
 * list. Whether a post happens to exist is not a reason a client hears a
 * different answer about their profile.
 */
export function listingReason(
  data: localSeoReportData,
  listing: ListingView,
): string {
  const failed = describeFailed(readsIn(data.readFailures, ["localBusiness"]));
  if (failed) return failed;
  const pending = describePending(
    readsIn(data.pendingReads, ["localBusiness"]),
  );
  if (pending) return pending;
  if (listing.kind === "other") return listing.text;
  if (data.profile) return NOT_FOUND;
  return NEVER_RUN;
}

/**
 * Both halves, not whichever one lost. The lookup being missing is the half a
 * client can act on, so it is always stated; the posts half is appended when
 * it has something of its own to say.
 */
export function dropReason(
  data: localSeoReportData,
  listing: ListingView,
  posts: PostsView,
): string {
  const bothFailed = readsIn(data.readFailures, ["localBusiness", "gbpPosts"]);
  const combined = bothFailed.length > 1 ? describeFailed(bothFailed) : null;
  if (combined) return combined;
  const postsNote = posts.kind === "note" ? posts.text : null;
  return [listingReason(data, listing), postsNote].filter(Boolean).join(" ");
}
