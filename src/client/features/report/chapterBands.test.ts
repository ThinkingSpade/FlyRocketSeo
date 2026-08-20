import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The chapter band is printed on every sheet as a number and a kicker
 * together, and the pairing is meant to be 1:1. `citations.tsx` picks its own
 * band by reasoning from that invariant, and a commit message asserted it
 * held — while `rankTracking.tsx` was shipping `02 RANK TRACKING` into the
 * same PDF as `02 CONTENT`. Nothing checked it, so nothing caught it.
 *
 * Read off the source rather than off a built report: a band is only wrong
 * relative to every OTHER chapter, and no single chapter's own tests can see
 * that. Grepping is crude, but the alternative — a registry every builder
 * must remember to join — is the kind of bookkeeping this drifted out of in
 * the first place.
 */
const REPORT_DIR = join(process.cwd(), "src/client/features/report");
const CHAPTER_DIR = join(REPORT_DIR, "chapters");

/** `number: "04",` … `kicker: "Opportunities",` in either order, one sheet. */
function readBands(source: string): Array<{ number: string; kicker: string }> {
  const bands: Array<{ number: string; kicker: string }> = [];
  const numbers = [...source.matchAll(/number:\s*"(\d{2})"/g)];
  const kickers = [...source.matchAll(/kicker:\s*"([^"]+)"/g)];
  // Constants (`const CHAPTER_NUMBER = "02"`) are resolved by pairing in
  // source order, which holds because each spec literal lists both.
  const constNumber = /CHAPTER_NUMBER\s*=\s*"(\d{2})"/.exec(source)?.[1];
  const constKicker = /CHAPTER_KICKER\s*=\s*"([^"]+)"/.exec(source)?.[1];
  if (constNumber && constKicker) {
    bands.push({ number: constNumber, kicker: constKicker });
  }
  for (const [index, match] of numbers.entries()) {
    const kicker = kickers[index]?.[1];
    if (kicker) bands.push({ number: match[1], kicker });
  }
  return bands;
}

function collectBands() {
  const files = [
    ...readdirSync(CHAPTER_DIR)
      .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
      .map((name) => join(CHAPTER_DIR, name)),
    join(REPORT_DIR, "reportChapters.tsx"),
    join(REPORT_DIR, "reportChaptersSite.tsx"),
  ];

  const byNumber = new Map<string, Set<string>>();
  const byKicker = new Map<string, Set<string>>();
  for (const file of files) {
    for (const band of readBands(readFileSync(file, "utf8"))) {
      const kickers = byNumber.get(band.number) ?? new Set<string>();
      kickers.add(band.kicker);
      byNumber.set(band.number, kickers);

      const numbers = byKicker.get(band.kicker) ?? new Set<string>();
      numbers.add(band.number);
      byKicker.set(band.kicker, numbers);
    }
  }
  return { byNumber, byKicker };
}

describe("report chapter bands", () => {
  it("finds bands to check at all", () => {
    // Guards the regexes: if the spec shape changes, the two tests below would
    // silently pass over an empty set and stop protecting anything.
    const { byNumber } = collectBands();
    expect(byNumber.size).toBeGreaterThanOrEqual(5);
  });

  it("gives each band number exactly one kicker", () => {
    const { byNumber } = collectBands();
    const collisions = [...byNumber.entries()]
      .filter(([, kickers]) => kickers.size > 1)
      .map(([number, kickers]) => `${number} -> ${[...kickers].join(" | ")}`);

    expect(collisions).toEqual([]);
  });

  it("gives each kicker exactly one band number", () => {
    // The other direction: one section split across two numbers reads, in the
    // page furniture, as two unrelated chapters.
    const { byKicker } = collectBands();
    const split = [...byKicker.entries()]
      .filter(([, numbers]) => numbers.size > 1)
      .map(([kicker, numbers]) => `${kicker} -> ${[...numbers].join(" | ")}`);

    expect(split).toEqual([]);
  });
});
