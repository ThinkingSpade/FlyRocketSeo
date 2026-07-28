/**
 * The single search query the Citation Tracker sends for one run.
 *
 * Anchored to the business name plus the strongest available disambiguator,
 * so results are about THIS business rather than a same-named one
 * elsewhere. City is preferred over phone: directories render a city as
 * plain text in listing titles and snippets, while phone numbers are
 * formatted inconsistently across sites (dashes, dots, parens, spaces, or a
 * tel: link) and rarely match a literal search the way a city name does.
 * Phone is used only when no city is on file. Exactly one query per run --
 * see CitationTrackerService's spend-discipline comment for why.
 */
export function buildCitationSearchQuery(business: {
  businessName: string;
  city: string | null;
  phone: string | null;
}): string {
  const name = business.businessName.trim();
  const city = business.city?.trim();
  if (city) return `${name} ${city}`;
  const phone = business.phone?.trim();
  if (phone) return `${name} ${phone}`;
  return name;
}
