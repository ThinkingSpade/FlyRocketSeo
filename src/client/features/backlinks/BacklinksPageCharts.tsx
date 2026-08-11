import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartActiveDot } from "@/client/components/chart/ChartActiveDot";
import {
  CHART_AXIS_TICK,
  CHART_CURSOR_LINE,
  CHART_X_TICK_GAP,
} from "@/client/components/chart/chartTheme";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { classifyNumericSeries } from "./backlinksChartInformation";
import {
  ChartLegend,
  ChartTooltip,
  EmptyChartState,
  formatAxisValue,
  formatChartTick,
  isActivitySeries,
  isStableSeries,
  useChartWidth,
} from "./BacklinksChartChrome";

export function BacklinksTrendChart({
  data,
}: {
  data: BacklinksOverviewData["trends"];
}) {
  const { containerRef, chartWidth } = useChartWidth();
  const backlinksInformation = classifyNumericSeries(
    data.map((point) => point.backlinks),
  );
  const domainsInformation = classifyNumericSeries(
    data.map((point) => point.referringDomains),
  );
  const points = data.filter(
    (point) => point.backlinks != null || point.referringDomains != null,
  );

  if (
    isStableSeries(backlinksInformation) &&
    isStableSeries(domainsInformation)
  ) {
    return (
      <EmptyChartState title="Backlinks and referring domains were unchanged over this period." />
    );
  }

  if (
    backlinksInformation.kind !== "varying" &&
    domainsInformation.kind !== "varying"
  ) {
    return <EmptyChartState />;
  }

  return (
    <div
      ref={containerRef}
      className="h-56 min-w-0"
      aria-label="Backlink trend chart"
    >
      {chartWidth > 0 ? (
        <LineChart
          width={chartWidth}
          height={224}
          data={points}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.12}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={CHART_X_TICK_GAP}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatAxisValue}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatAxisValue}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip content={ChartTooltip} cursor={CHART_CURSOR_LINE} />
          <Legend content={<ChartLegend />} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="backlinks"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            activeDot={<ChartActiveDot />}
            isAnimationActive={false}
            name="Backlinks"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="referringDomains"
            stroke="var(--color-base-content)"
            strokeOpacity={0.55}
            strokeWidth={2}
            dot={false}
            activeDot={<ChartActiveDot />}
            isAnimationActive={false}
            name="Referring domains"
          />
        </LineChart>
      ) : null}
    </div>
  );
}

/**
 * Domain authority over the same twelve months. The `rank` values already ride
 * along on the history call the overview makes, so this chart costs nothing —
 * it was simply never plotted.
 */
export function BacklinksAuthorityChart({
  data,
}: {
  data: BacklinksOverviewData["trends"];
}) {
  const { containerRef, chartWidth } = useChartWidth();
  const information = classifyNumericSeries(data.map((point) => point.rank));
  const points = data.filter(
    (point): point is typeof point & { rank: number } => point.rank != null,
  );

  if (information.kind === "all-zero") {
    return (
      <EmptyChartState title="Domain authority stayed at 0 over this period" />
    );
  }

  if (information.kind === "constant") {
    return (
      <EmptyChartState
        title={`Domain authority held at ${formatAxisValue(information.value)} over this period`}
      />
    );
  }

  if (information.kind !== "varying") {
    return <EmptyChartState />;
  }

  return (
    <div
      ref={containerRef}
      className="h-56 min-w-0"
      aria-label="Domain authority trend chart"
    >
      {chartWidth > 0 ? (
        <LineChart
          width={chartWidth}
          height={224}
          data={points}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.12}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={CHART_X_TICK_GAP}
          />
          {/* Fixed to the one-hundred rank scale the backlinks calls request,
              so a flat profile reads as flat instead of being auto-zoomed into
              looking volatile. */}
          <YAxis
            domain={[0, 100]}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip content={ChartTooltip} cursor={CHART_CURSOR_LINE} />
          <Legend content={<ChartLegend />} />
          <Line
            type="monotone"
            dataKey="rank"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            activeDot={<ChartActiveDot />}
            isAnimationActive={false}
            name="Domain authority"
          />
        </LineChart>
      ) : null}
    </div>
  );
}

export function BacklinksNewLostChart({
  data,
}: {
  data: BacklinksOverviewData["newLostTrends"];
}) {
  const { containerRef, chartWidth } = useChartWidth();
  const newInformation = classifyNumericSeries(
    data.map((point) => point.newBacklinks),
  );
  const lostInformation = classifyNumericSeries(
    data.map((point) => point.lostBacklinks),
  );
  const points = data.filter(
    (point) => point.newBacklinks != null || point.lostBacklinks != null,
  );

  if (
    newInformation.kind === "all-null" &&
    lostInformation.kind === "all-null"
  ) {
    return (
      <EmptyChartState title="Historical gain/loss values weren’t reported." />
    );
  }

  if (
    newInformation.kind === "all-zero" &&
    lostInformation.kind === "all-zero"
  ) {
    return (
      <EmptyChartState title="No backlink gains or losses were recorded in this period." />
    );
  }

  if (!isActivitySeries(newInformation) && !isActivitySeries(lostInformation)) {
    return <EmptyChartState />;
  }

  return (
    <div
      ref={containerRef}
      className="h-56 min-w-0"
      aria-label="New and lost backlinks chart"
    >
      {chartWidth > 0 ? (
        <LineChart
          width={chartWidth}
          height={224}
          data={points}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.12}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartTick}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={CHART_X_TICK_GAP}
          />
          <YAxis
            tickFormatter={formatAxisValue}
            tick={CHART_AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip content={ChartTooltip} cursor={CHART_CURSOR_LINE} />
          <Legend content={<ChartLegend />} />
          <Line
            type="monotone"
            dataKey="lostBacklinks"
            stroke="var(--color-error)"
            strokeWidth={2}
            dot={false}
            activeDot={<ChartActiveDot />}
            isAnimationActive={false}
            name="Lost backlinks"
          />
          <Line
            type="monotone"
            dataKey="newBacklinks"
            stroke="var(--color-success)"
            strokeWidth={2}
            dot={false}
            activeDot={<ChartActiveDot />}
            isAnimationActive={false}
            name="New backlinks"
          />
        </LineChart>
      ) : null}
    </div>
  );
}
