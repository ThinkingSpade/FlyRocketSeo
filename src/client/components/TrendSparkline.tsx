import { useId } from "react";
import { buildSparklinePath, type SparklinePoint } from "./trendSparklinePath";

/**
 * Tiny inline trend chart for table rows (Keyword Magic style): a plain SVG
 * polyline with a soft gradient fill. Hand-rolled instead of recharts so a
 * 150-row table stays cheap to render.
 */
export function TrendSparkline({
  points,
  width = 64,
  height = 22,
}: {
  points: SparklinePoint[];
  width?: number;
  height?: number;
}) {
  const gradientId = useId();
  const path = buildSparklinePath(points, width, height);
  if (!path) {
    return <span className="text-base-content/30">—</span>;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle text-primary"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={path.line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
