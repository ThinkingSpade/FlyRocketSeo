import { WarningCircle, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { Badge } from "@cloudflare/kumo/components/badge";

export function extractPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatStartedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Badge variant="info" className="gap-1">
        <CircleNotch className="size-3 animate-spin" /> Running
      </Badge>
    );
  }

  if (status === "completed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-success/80 border-success/30 bg-success/5"
      >
        <CheckCircle className="size-3" /> Done
      </Badge>
    );
  }

  return (
    <Badge variant="error" className="gap-1">
      <WarningCircle className="size-3" /> Failed
    </Badge>
  );
}

export function HttpStatusBadge({ code }: { code: number | null }) {
  if (!code) return <Badge variant="neutral">-</Badge>;
  if (code >= 200 && code < 300) {
    return <Badge variant="success">{code}</Badge>;
  }
  if (code >= 300 && code < 400) {
    return <Badge variant="warning">{code}</Badge>;
  }
  return <Badge variant="error">{code}</Badge>;
}

export function LighthouseScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-base-content/40">-</span>;
  }
  const color =
    score >= 90 ? "text-success" : score >= 50 ? "text-warning" : "text-error";
  return <span className={`font-medium text-sm ${color}`}>{score}</span>;
}

export function StatCard({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="relative flex flex-col rounded-xl bg-base-100 border border-base-300">
      <div className="flex flex-auto flex-col p-4 gap-2 text-sm">
        <p className="text-xs uppercase tracking-wide text-base-content/60">
          {label}
        </p>
        <p className={`text-2xl font-semibold ${className}`}>{value}</p>
      </div>
    </div>
  );
}
