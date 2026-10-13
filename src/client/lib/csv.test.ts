import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";

describe("buildCsv", () => {
  it("rounds decimal numbers to at most two places", () => {
    const csv = buildCsv(
      ["Page", "Traffic", "Keywords"],
      [["/tools", 1250.321954, 4]],
    );

    expect(csv).toContain('"1250.32"');
    expect(csv).toContain('"4"');
  });

  it("keeps formula-injection protection for string cells", () => {
    const csv = buildCsv(["Value"], [['=HYPERLINK("evil")']]);

    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
  });
  it("preserves provider precision only when requested and keeps formula safeguards", () => {
    const csv = Reflect.apply(buildCsv, null, [
      ["CPC", "Competition", "Target"],
      [[0.1234, 0.001, "=formula"]],
      { preservePrecision: true },
    ]);
    expect(csv).toContain('"0.1234","0.001","\'=formula"');
  });
});
