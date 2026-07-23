type OffTopicNoticeProps = {
  count: number;
  seedKeyword: string;
  show: boolean;
  onToggle: () => void;
  /** Mobile panels run a size step down from desktop throughout this tab. */
  compact?: boolean;
};

/**
 * States the fact ("share no words with") rather than a judgement, and never
 * removes the rows itself — the toggle only decides whether they're on screen.
 */
export function OffTopicNotice({
  count,
  seedKeyword,
  show,
  onToggle,
  compact = false,
}: OffTopicNoticeProps) {
  if (count === 0) return null;

  return (
    <div
      className={`shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-base-300 text-base-content/60 ${compact ? "text-xs" : "text-sm"}`}
    >
      <span>
        {`${count} ${count === 1 ? "keyword shares" : "keywords share"} no words with "${seedKeyword}"`}
        {/* Only claim they're hidden while they actually are. */}
        {show ? "" : " — hidden"}
      </span>
      <button className="btn btn-ghost btn-xs" onClick={onToggle}>
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
