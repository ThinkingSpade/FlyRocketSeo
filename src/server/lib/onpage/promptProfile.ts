/**
 * The business-context block handed to the on-page rewriter.
 *
 * Pure, and in `server/lib` rather than beside the service, for the reason
 * `CompetitorsTableColumns` records about its own split: importing
 * `OnPageAiService` pulls the repository, the db provider and finally
 * `cloudflare:workers` into the test run, which a test of prompt text has no
 * business loading.
 */

export type RewriteProfile = {
  offer: string;
  customer: string;
  exclusions: string;
};

/**
 * The block, or `[]` when there is nothing the model can trust.
 *
 * Exclusions carry the most weight of the three and are stated as a rule
 * rather than as background: they are the one thing a page read cannot
 * recover, because a page says what a business does and rarely what it
 * refuses to do. Without them the model happily suggests "Buy Vending
 * Machines" to an operator who only places them — the page it is rewriting
 * says "vending machines" either way.
 */
export function buildProfileBlock(profile: RewriteProfile | null): string[] {
  if (!profile) return [];

  const lines: string[] = ["This is the business you are writing for:"];
  if (profile.offer.trim()) lines.push(`- Sells: ${profile.offer.trim()}`);
  if (profile.customer.trim())
    lines.push(`- Sells to: ${profile.customer.trim()}`);

  // Nothing positive to describe. A block that opens "this is the business you
  // are writing for" and then lists only what they do not do reads as an
  // accusation, and gives the model no subject to write about.
  if (lines.length === 1) return [];

  if (profile.exclusions.trim()) {
    lines.push(
      `- Does NOT offer: ${profile.exclusions.trim()}`,
      "Never imply the business provides anything on that list, even where the",
      "page's existing wording suggests it.",
    );
  }

  lines.push("");
  return lines;
}
