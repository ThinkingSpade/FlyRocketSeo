import { buildCsv, downloadCsv } from "@/client/lib/csv";
import type { LinkIntersectResult } from "@/types/schemas/backlinks-compare";

/**
 * Split out of BacklinksGapCards, which sits on this repo's 400-line ceiling.
 * A pure CSV builder with no JSX was the obvious thing to lift.
 */
export function exportLinkGap(
  rows: LinkIntersectResult["rows"],
  target: string,
) {
  const slug = target.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  downloadCsv(
    `link-gap-${slug || "export"}.csv`,
    buildCsv(
      [
        "Referring Domain",
        "Competitors Linked",
        "Which Competitors",
        "Domain Authority",
        "Backlinks",
        "Spam Score",
        "First Seen",
      ],
      rows.map((row) => [
        row.domain,
        row.competitorsLinked,
        row.linkedTo.join(" | "),
        row.rank,
        row.backlinks,
        row.spamScore,
        row.firstSeen,
      ]),
    ),
  );
}
