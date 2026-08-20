import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SearchPerformancePage } from "@/client/features/search-performance/SearchPerformancePage";
import {
  DEFAULT_SEARCH_PERFORMANCE_TAB,
  searchPerformanceSearchSchema,
} from "@/client/features/search-performance/searchPerformanceSearch";

export const Route = createFileRoute(
  "/_project/p/$projectId/search-performance",
)({
  validateSearch: searchPerformanceSearchSchema,
  component: SearchPerformanceRoute,
});

function SearchPerformanceRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q, tab } = Route.useSearch();

  return (
    <SearchPerformancePage
      projectId={projectId}
      navigate={navigate}
      tab={tab ?? DEFAULT_SEARCH_PERFORMANCE_TAB}
      focusQuery={q ?? null}
    />
  );
}
