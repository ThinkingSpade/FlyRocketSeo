import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PositionDistribution } from "./PositionDistribution";

it("renders unknown buckets and suppresses a percentage chart for partial coverage", () => {
  const html = renderToStaticMarkup(
    createElement(PositionDistribution, {
      buckets: {
        top3: null,
        pos4to10: 0,
        pos11to20: 4,
        pos21to50: null,
        pos51plus: null,
      },
    }),
  );
  expect(html).toContain("Partial provider coverage");
  expect(html.match(/Unknown/g)).toHaveLength(4);
  expect(html).not.toContain("width:");
  expect(html).toContain(">0</span>");
});

it("keeps the per-bucket zero observations visible without inventing shares", () => {
  const html = renderToStaticMarkup(
    createElement(PositionDistribution, {
      buckets: {
        top3: 0,
        pos4to10: 0,
        pos11to20: 0,
        pos21to50: 0,
        pos51plus: 0,
      },
    }),
  );
  expect(html.match(/>0<\/span>/g)).toHaveLength(5);
  expect(html).not.toContain("Unknown");
  expect(html).not.toContain("width:");
});
