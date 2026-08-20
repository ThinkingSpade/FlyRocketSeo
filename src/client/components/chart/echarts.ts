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
 * SVGRenderer, not CanvasRenderer: canvas wins for tens of thousands of points,
 * which nothing here plots, and this app renders a print-ready client report,
 * where a canvas chart prints at screen resolution while SVG prints at the
 * printer's.
 *
 * This choice is NOT what keeps modern colour spaces working, though an earlier
 * version of this comment claimed it was. zrender's parser cannot read oklch()
 * or oklab(), and picking SVG only avoids that for painting — it still parses
 * colours in JavaScript to animate them, and an unparseable one throws there.
 * What actually makes the tokens safe is useChartTheme resolving every colour
 * to rgba() before it reaches ECharts. See the comment there.
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
