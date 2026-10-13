export type OpportunityStatus =
  | "not_started"
  | "in_progress"
  | "implemented"
  | "results_pending"
  | "measured"
  | "dismissed";
export type OpportunityKind = "page_decline" | "page_review" | "internal_link";
export type EvidenceScope = {
  organizationId: string;
  projectId: string;
  target: string;
  siteUrl: string;
  connectedBy: string | null;
  country: string | null;
  device: "DESKTOP" | "MOBILE" | "TABLET" | null;
  searchType: "web" | "image" | "video" | "news";
};
export type EvidenceWindow = { startDate: string; endDate: string };
export type PageObservation = {
  clicks: number;
  impressions: number;
  position: number | null;
};
export type EvidenceSnapshot = {
  schemaVersion: 1;
  source: "Google Search Console" | "Google Search Console and captured HTML";
  fetchedAt: string;
  scope: EvidenceScope;
  url: string;
  window: EvidenceWindow;
  previousWindow: EvidenceWindow;
  current: PageObservation;
  previous: PageObservation;
  coverage: {
    finalData: boolean;
    currentRows: number;
    previousRows: number;
    truncated: boolean;
    complete: boolean;
  };
  limitations: string[];
  link?: {
    sourceUrl: string;
    destinationUrl: string;
    anchor: string;
    sourceLocation: string;
    sourceExcerpt: string;
    capturedAt: string;
  };
};
export type OpportunityResult = {
  availability: "measured" | "insufficient" | "incomparable";
  measuredAt: string;
  baseline: EvidenceSnapshot;
  after: EvidenceSnapshot;
  clicksChange: number | null;
  impressionsChange: number | null;
  limitations: string[];
};
export type OpportunityEvent = {
  id: string;
  actorUserId: string | null;
  createdAt: string;
  kind:
    | "created"
    | "updated"
    | "observed"
    | "no_longer_observed"
    | "measurement";
  note: string | null;
  status: OpportunityStatus;
  revision: number;
  result: OpportunityResult | null;
};
export type OpportunityHistory = {
  events: OpportunityEvent[];
  hasMore: boolean;
  beforeRevision: number | null;
};
export type Opportunity = {
  id: string;
  projectId: string;
  target: string;
  kind: OpportunityKind;
  title: string;
  finding: string;
  url: string;
  assetRefs: string[];
  priorityBand: "high" | "medium" | "low";
  confidenceBand: "high" | "medium" | "low";
  limitations: string[];
  nextSteps: string[];
  status: OpportunityStatus;
  observationState: "observed" | "no_longer_observed";
  assigneeUserId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  implementedAt: string | null;
  revision: number;
  evidence: EvidenceSnapshot;
  result: OpportunityResult | null;
  history: OpportunityEvent[];
  historyCoverage: Omit<OpportunityHistory, "events">;
};
export type OpportunityFinding = Pick<
  Opportunity,
  | "kind"
  | "title"
  | "finding"
  | "url"
  | "assetRefs"
  | "priorityBand"
  | "confidenceBand"
  | "limitations"
  | "nextSteps"
> & { evidence: EvidenceSnapshot };
export type OpportunityRun = {
  id: string;
  fetchedAt: string;
  observedFrom: string;
  observedTo: string;
  availability: "ready" | "unavailable" | "insufficient";
  reasons: string[];
};
