/**
 * The shape of a project's business profile, shared by the client form, the
 * server repository and the fit classifier.
 *
 * Kept separate from `keywordFit.ts` so importing the type costs nothing: the
 * classifier only ever needs `offer` and `exclusions` (its own `FitProfile`),
 * while the editor and the Phase 2 seed generator need the whole record.
 */

export const SERVICE_AREA_KINDS = [
  "local",
  "regional",
  "national",
  "global",
] as const;

export type ServiceAreaKind = (typeof SERVICE_AREA_KINDS)[number];

export function isServiceAreaKind(value: unknown): value is ServiceAreaKind {
  // `some` with an equality check rather than `includes(value as ...)`: the
  // cast would assert the very thing this function exists to establish.
  return SERVICE_AREA_KINDS.some((kind) => kind === value);
}

/**
 * How each service-area shape is described to the user, and what it changes.
 *
 * The second half matters more than the first: this field is not decoration,
 * it decides whether generated seed keywords carry a geo modifier at all. A
 * DFW vending operator wants "office coffee service dallas"; a global SaaS
 * wants that same phrase with the city stripped out as noise.
 */
export const SERVICE_AREA_LABELS: Record<
  ServiceAreaKind,
  { label: string; hint: string }
> = {
  local: {
    label: "One local area",
    hint: "Serves a single city or metro. Seeds get local modifiers.",
  },
  regional: {
    label: "A few areas or one region",
    hint: "Serves a state or several metros. Seeds get local modifiers.",
  },
  national: {
    label: "Nationwide",
    hint: "Serves one whole country. Seeds stay unmodified.",
  },
  global: {
    label: "Worldwide",
    hint: "Serves customers anywhere. Seeds stay unmodified.",
  },
};

/** Whether this shape means generated seeds should carry a geo modifier. */
export function wantsGeoModifiers(kind: ServiceAreaKind): boolean {
  return kind === "local" || kind === "regional";
}

export type ProjectProfile = {
  offer: string;
  customer: string;
  exclusions: string;
  brandTerms: string;
  serviceAreaKind: ServiceAreaKind;
  source: "ai" | "manual";
  /** Null means an AI draft nobody has accepted yet. */
  confirmedAt: string | null;
};

export const EMPTY_PROFILE: ProjectProfile = {
  offer: "",
  customer: "",
  exclusions: "",
  brandTerms: "",
  serviceAreaKind: "national",
  source: "manual",
  confirmedAt: null,
};
