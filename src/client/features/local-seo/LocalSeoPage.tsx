import { useState } from "react";
import {
  BadgeCheck,
  MapPin,
  MessageSquareReply,
  Search,
  Star,
  TrendingUp,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getBusinessProfile } from "@/serverFunctions/local-seo";
import {
  AnalyzeDomainPrompt,
  type AnalyzePreviewItem,
} from "@/client/components/AnalyzeDomainPrompt";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import {
  LocalGscContext,
  useLocalSeoProjectContext,
} from "@/client/features/local-seo/LocalProjectContext";
import { buildGbpAudit } from "./gbpAudit";
import { GbpAuditCard } from "./GbpAuditCard";
import { GbpWriteSection } from "./GbpWriteSection";
import { LocalReviewsSection } from "./LocalReviewsSection";
import { CitationTrackerSection } from "@/client/features/citations/CitationTrackerSection";

const LOCAL_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: Star,
    title: "Rating & reviews",
    description: "Star rating, review count, and the newest reviews",
  },
  {
    icon: MessageSquareReply,
    title: "Response coverage",
    description: "Reply rate and unanswered negative reviews",
  },
  {
    icon: TrendingUp,
    title: "Review velocity",
    description: "How steadily reviews arrive, month by month",
  },
  {
    icon: BadgeCheck,
    title: "Profile completeness",
    description: "Categories, hours, claimed status and description",
  },
];

type LocalSeoNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

export function LocalSeoPage({
  projectId,
  navigate,
  query,
}: {
  projectId: string;
  navigate: LocalSeoNavigate;
  query: string;
}) {
  const [input, setInput] = useState(query);
  const [runKeyword, setRunKeyword] = useState<string | null>(null);
  // Reported by LocalReviewsSection once its (user-triggered) review crawl
  // completes -- undefined until then, which buildGbpAudit already treats
  // as "not known" rather than assuming zero owner replies.
  const [reviews, setReviews] = useState<
    Array<{ ownerAnswer: string | null }> | undefined
  >(undefined);
  const run = useAuthorizedRun(createMeteredRunKey(projectId, input.trim()));
  const projectContext = useLocalSeoProjectContext({
    projectId,
    initialQuery: query,
    onPrefill: setInput,
  });
  const { projectDomain, cachedBusiness, businessGuess, guessSource } =
    projectContext;

  const profileQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runKeyword != null,
    queryKey: ["business-profile", projectId, runKeyword],
    queryFn: () =>
      getBusinessProfile({ data: { projectId, keyword: runKeyword ?? "" } }),
  });

  const errorMessage = profileQuery.isError
    ? getStandardErrorMessage(profileQuery.error)
    : null;
  const profile =
    profileQuery.data ??
    (runKeyword == null ? cachedBusiness?.profile : undefined);
  const profileKeyword = runKeyword ?? cachedBusiness?.keyword ?? businessGuess;
  // Computed straight from data already on hand (the looked-up profile plus
  // whatever reviews have loaded so far) -- pure arithmetic, no fetch of its
  // own, so it's safe to recompute on every render rather than memoized.
  const audit =
    profile && profile.found
      ? buildGbpAudit({
          found: profile.found,
          category: profile.category,
          additionalCategories: profile.additionalCategories,
          description: profile.description,
          logo: profile.logo,
          mainImage: profile.mainImage,
          phone: profile.phone,
          url: profile.url,
          domain: profile.domain,
          rating: profile.rating,
          reviewsCount: profile.reviewsCount,
          isClaimed: profile.isClaimed,
          reviews,
        })
      : null;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <MapPin className="size-5" />
          Local SEO
        </h1>
        <p className="text-sm text-base-content/60">
          Look up a Google Business Profile and its latest reviews — ratings,
          categories, and claimed status at a glance.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim();
              if (!next) return;
              setRunKeyword(next);
              run.authorize();
              navigate({
                search: (prev) => ({ ...prev, q: next }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full">
              <span className="label-text pb-1 text-xs font-medium">
                Business name (add a city for precision)
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="Joe's Pizza Brooklyn"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              {guessSource && runKeyword == null ? (
                <span className="mt-1 text-xs text-base-content/50">
                  Prefilled from {guessSource}. Edit it or add a city before
                  looking up.
                </span>
              ) : null}
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || profileQuery.isFetching}
            >
              {profileQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Look up
            </button>
          </form>
          <LocalGscContext projectId={projectId} context={projectContext} />
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {runKeyword == null && !profile ? (
        <AnalyzeDomainPrompt
          domain={projectDomain}
          title="Look up your business profile"
          description="Search your Google Business Profile by name — add a city if the name is common."
          preview={LOCAL_ANALYZE_PREVIEW}
          onAnalyze={() => {
            const guess = businessGuess.trim();
            if (!guess) return;
            setInput(guess);
            setRunKeyword(guess);
            run.authorize(createMeteredRunKey(projectId, guess));
            navigate({
              search: (prev) => ({ ...prev, q: guess }),
              replace: false,
            });
          }}
          isBusy={profileQuery.isFetching}
        />
      ) : profile ? (
        !profile.found ? (
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body items-center py-12 text-sm text-base-content/60">
              No Google Business Profile found for &ldquo;
              {runKeyword ?? input}&rdquo;. Try adding the city or checking the
              spelling.
            </div>
          </div>
        ) : (
          <>
            <ProfileCard profile={profile} />
            {audit ? (
              <GbpAuditCard audit={audit} projectId={projectId} />
            ) : null}
            <GbpWriteSection projectId={projectId} />
            {profileKeyword ? (
              <LocalReviewsSection
                // Remounts on a new business so a stale taskId/reviews list
                // from the previous lookup can never get silently attributed
                // to this one -- both this section's own display and the
                // audit's owner-response check depend on that not happening.
                key={profileKeyword}
                projectId={projectId}
                keyword={profileKeyword}
                onReviewsLoaded={setReviews}
              />
            ) : null}
            <CitationTrackerSection
              // Same remount-on-new-business reasoning as LocalReviewsSection
              // above -- a stale authorized run for the previous business
              // must never be silently reused for this one.
              key={profileKeyword}
              projectId={projectId}
              businessName={profile.title ?? profileKeyword}
              city={profile.city}
              region={profile.region}
              phone={profile.phone}
            />
          </>
        )
      ) : null}
    </div>
  );
}

type ProfileData = NonNullable<Awaited<ReturnType<typeof getBusinessProfile>>>;

function ProfileCard({ profile }: { profile: ProfileData }) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div className="flex items-start gap-3">
          {profile.logo ? (
            <img
              src={profile.logo}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{profile.title}</h2>
            <p className="text-sm text-base-content/60">
              {[profile.category, ...profile.additionalCategories]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            <span className="font-semibold">{profile.rating ?? "—"}</span>
            <span className="text-base-content/50">
              ({profile.reviewsCount?.toLocaleString() ?? "—"})
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <ProfileField label="Address" value={profile.address} />
          <ProfileField label="Phone" value={profile.phone} />
          <ProfileField label="Website" value={profile.url} isLink />
          <ProfileField
            label="Claimed"
            value={
              profile.isClaimed == null
                ? null
                : profile.isClaimed
                  ? "Yes"
                  : "No — claim it to manage this profile"
            }
          />
        </div>

        {profile.description ? (
          <p className="text-sm text-base-content/70">{profile.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  isLink = false,
}: {
  label: string;
  value: string | null;
  isLink?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-base-content/50">
        {label}
      </span>
      {value == null ? (
        <span className="text-base-content/40">—</span>
      ) : isLink ? (
        <a
          className="link link-hover break-all"
          href={value}
          target="_blank"
          rel="noopener noreferrer"
        >
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}
