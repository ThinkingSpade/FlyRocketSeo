// Pure priority scoring + Markdown export for the Topic Clusters plan
// (no I/O), split out so the ranking rules are unit-testable.

type ClusterKeyword = {
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
};

type TopicCluster = {
  name: string;
  keywords: ClusterKeyword[];
  totalVolume: number;
};

export type ClusterPriority = 1 | 2 | 3;

type PrioritizedCluster = TopicCluster & {
  priority: ClusterPriority;
  /** Average KD across keywords that have one, or null. */
  averageDifficulty: number | null;
  /** Volume discounted by difficulty — the ranking key. */
  opportunityScore: number;
};

function averageDifficulty(cluster: TopicCluster): number | null {
  const values = cluster.keywords
    .map((keyword) => keyword.keywordDifficulty)
    .filter((value): value is number => value != null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Rank clusters into a roadmap: volume discounted by average difficulty
 * (unknown KD is treated as middling). The top third becomes P1, the middle
 * P2, the rest P3 — output order is by descending opportunity.
 */
export function prioritizeClusters(
  clusters: TopicCluster[],
): PrioritizedCluster[] {
  const scored = clusters
    .map((cluster) => {
      const kd = averageDifficulty(cluster);
      return {
        ...cluster,
        averageDifficulty: kd,
        opportunityScore: cluster.totalVolume / ((kd ?? 50) + 10),
      };
    })
    .toSorted((a, b) => b.opportunityScore - a.opportunityScore);

  const tierSize = Math.ceil(scored.length / 3);
  return scored.map((cluster, index) => {
    const tier = Math.floor(index / tierSize);
    const priority: ClusterPriority = tier === 0 ? 1 : tier === 1 ? 2 : 3;
    return { ...cluster, priority };
  });
}

type ClusterPlanTotals = {
  clusterCount: number;
  keywordCount: number;
  totalVolume: number;
  averageDifficulty: number | null;
};

export function computeClusterPlanTotals(
  clusters: TopicCluster[],
): ClusterPlanTotals {
  let keywordCount = 0;
  let totalVolume = 0;
  let difficultySum = 0;
  let difficultyCount = 0;
  for (const cluster of clusters) {
    keywordCount += cluster.keywords.length;
    totalVolume += cluster.totalVolume;
    for (const keyword of cluster.keywords) {
      if (keyword.keywordDifficulty != null) {
        difficultySum += keyword.keywordDifficulty;
        difficultyCount += 1;
      }
    }
  }
  return {
    clusterCount: clusters.length,
    keywordCount,
    totalVolume,
    averageDifficulty:
      difficultyCount > 0 ? Math.round(difficultySum / difficultyCount) : null,
  };
}

const EM_DASH = "—";

function formatVolume(value: number | null): string {
  return value == null ? EM_DASH : String(value);
}

function formatKd(value: number | null): string {
  return value == null ? EM_DASH : String(Math.round(value));
}

/**
 * Render the whole hub-and-spoke plan as Markdown for pasting into an AI
 * chat: hub keywords plus each cluster with priority, volume, and keywords.
 */
export function clusterPlanToMarkdown(plan: {
  topic: string;
  hub: ClusterKeyword[];
  clusters: PrioritizedCluster[];
}): string {
  const lines: string[] = [
    `# Topic cluster plan: ${plan.topic}`,
    "",
    `## Hub page — "${plan.topic}"`,
  ];
  if (plan.hub.length > 0) {
    lines.push(
      "Target keywords: " +
        plan.hub
          .map(
            (keyword) =>
              `${keyword.keyword} (${formatVolume(keyword.searchVolume)}/mo)`,
          )
          .join(", "),
    );
  }

  for (const cluster of plan.clusters) {
    lines.push(
      "",
      `## P${cluster.priority} — ${cluster.name} (${cluster.totalVolume} vol/mo${
        cluster.averageDifficulty != null
          ? `, avg KD ${Math.round(cluster.averageDifficulty)}`
          : ""
      })`,
      "| Keyword | Volume | KD |",
      "| --- | --- | --- |",
    );
    for (const keyword of cluster.keywords) {
      lines.push(
        `| ${keyword.keyword.replace(/\|/g, "\\|")} | ${formatVolume(
          keyword.searchVolume,
        )} | ${formatKd(keyword.keywordDifficulty)} |`,
      );
    }
  }

  return lines.join("\n");
}
