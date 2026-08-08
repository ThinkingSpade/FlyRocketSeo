/**
 * The ECharts instance every chart in the app passes to Kumo.
 *
 * Kumo takes `echarts` as a required prop rather than importing it, precisely
 * so the consumer decides which modules ship. Importing the `echarts` barrel
 * would pull every chart type and component — around 1MB — into the client
 * bundle for the six kinds this app actually draws. This registers those six
 * and nothing else.
 *
 * Add to the lists below when a new chart type appears; ECharts fails at
 * runtime rather than at build time if a chart uses an unregistered series,
 * so a missing entry shows up as an empty chart, not a compile error.
 *
 * SVGRenderer, not CanvasRenderer, and this is load-bearing rather than a
 * preference. This app's colour tokens resolve to oklch()/oklab(), which
 * zrender's own colour parser does not understand — under Canvas it has to
 * parse every colour itself, and those would fail. Under SVG the colour string
 * is written into an SVG attribute and the BROWSER parses it, so modern colour
 * spaces pass straight through. Switching renderers would silently break every
 * chart's colours.
 *
 * It is also the right choice on its own merits: canvas wins for tens of
 * thousands of points, which nothing here plots, and this app renders a
 * print-ready client report, where a canvas chart prints at screen resolution
 * while SVG prints at the printer's.
 */
import * as echarts from "echarts/core";
import {
  BarChart,
  LineChart,
  ScatterChart,
  TreemapChart,
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  TreemapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  // The rank charts' "Not in top N" band and their threshold rules.
  MarkAreaComponent,
  MarkLineComponent,
  SVGRenderer,
]);

export { echarts };
