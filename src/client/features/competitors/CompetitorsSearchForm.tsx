import { Search } from "lucide-react";

export function CompetitorsSearchForm({
  targetInput,
  competitorInput,
  needsCompetitor,
  isFetching,
  onTargetChange,
  onCompetitorChange,
  onSubmit,
}: {
  targetInput: string;
  competitorInput: string;
  needsCompetitor: boolean;
  isFetching: boolean;
  onTargetChange: (value: string) => void;
  onCompetitorChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="form-control w-full sm:max-w-xs">
        <span className="label-text pb-1 text-xs font-medium">Your domain</span>
        <input
          type="text"
          className="input input-bordered input-sm w-full"
          placeholder="example.com"
          value={targetInput}
          onChange={(event) => onTargetChange(event.target.value)}
        />
      </label>
      {needsCompetitor ? (
        <label className="form-control w-full sm:max-w-xs">
          <span className="label-text pb-1 text-xs font-medium">
            Competitor domain
          </span>
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder="competitor.com"
            value={competitorInput}
            onChange={(event) => onCompetitorChange(event.target.value)}
          />
        </label>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary btn-sm gap-1.5"
        disabled={
          !targetInput.trim() ||
          (needsCompetitor && !competitorInput.trim()) ||
          isFetching
        }
      >
        {isFetching ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <Search className="size-3.5" />
        )}
        Analyze
      </button>
    </form>
  );
}
