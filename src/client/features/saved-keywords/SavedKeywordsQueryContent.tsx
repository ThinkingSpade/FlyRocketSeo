import type { ComponentProps } from "react";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { SavedKeywordsStatus } from "./SavedKeywordsStatus";
import { SavedKeywordsTable } from "./SavedKeywordsTable";

export function SavedKeywordsQueryContent({
  failed,
  fetching,
  loading,
  totalCount,
  tableProps,
  onRetry,
}: {
  failed: boolean;
  fetching: boolean;
  loading: boolean;
  totalCount: number;
  tableProps: ComponentProps<typeof SavedKeywordsTable>;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <InlineQueryError
        message="Saved keywords could not be loaded."
        retrying={fetching}
        onRetry={onRetry}
      />
    );
  }
  return (
    <>
      <SavedKeywordsStatus
        totalCount={totalCount}
        isFetching={fetching && !loading}
      />
      <SavedKeywordsTable {...tableProps} />
    </>
  );
}
