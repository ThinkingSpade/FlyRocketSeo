import { useQuery } from "@tanstack/react-query";
import {
  getCompetitorsList,
  getKeywordGapPage,
} from "@/serverFunctions/competitors";
import type { KeywordGapMode } from "@/types/schemas/competitors";

export function useCompetitorsQuery(input: {
  projectId: string;
  target: string;
  page: number;
  pageSize: number;
  enabled: boolean;
}) {
  const target = input.target.trim();
  return useQuery({
    enabled: input.enabled && target !== "",
    queryKey: [
      "competitors-list",
      input.projectId,
      target,
      input.page,
      input.pageSize,
    ],
    queryFn: () =>
      getCompetitorsList({
        data: {
          projectId: input.projectId,
          target,
          page: input.page,
          pageSize: input.pageSize,
        },
      }),
    staleTime: 5 * 60_000,
  });
}

export function useKeywordGapQuery(input: {
  projectId: string;
  target: string;
  competitor: string;
  mode: KeywordGapMode;
  page: number;
  pageSize: number;
  enabled: boolean;
}) {
  const target = input.target.trim();
  const competitor = input.competitor.trim();
  return useQuery({
    enabled: input.enabled && target !== "" && competitor !== "",
    queryKey: [
      "keyword-gap",
      input.projectId,
      target,
      competitor,
      input.mode,
      input.page,
      input.pageSize,
    ],
    queryFn: () =>
      getKeywordGapPage({
        data: {
          projectId: input.projectId,
          target,
          competitor,
          mode: input.mode,
          page: input.page,
          pageSize: input.pageSize,
        },
      }),
    staleTime: 5 * 60_000,
  });
}
