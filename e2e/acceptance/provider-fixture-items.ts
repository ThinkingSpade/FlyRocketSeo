/** Raw HTTP fixtures for the real SDK adapters. No application RPC is replaced. */
export type TaskInput = Record<string, unknown>;
export function text(value: unknown, fallback = "operation rocket") {
  return typeof value === "string" ? value : fallback;
}
function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function backlinkTargetUrl(input: TaskInput) {
  const target = text(input.target, "operation.com");
  return target.startsWith("http") ? target : `https://${target}/guide`;
}
function keywordRow(keyword: string, volume: number | null = 120) {
  return {
    keyword,
    keyword_info: {
      search_volume: volume,
      cpc: 1.25,
      competition: 0.2,
      monthly_searches: [{ year: 2026, month: 9, search_volume: volume }],
    },
    keyword_properties: { keyword_difficulty: 20 },
    search_intent_info: { main_intent: "informational" },
  };
}
export function fixtureItems(path: string, input: TaskInput): unknown[] | null {
  const keyword = text(
    input.keyword,
    strings(input.keywords)[0] ?? "operation rocket",
  );
  if (keyword.includes("operation empty")) return [];
  if (JSON.stringify(input.filters ?? []).includes("absent-fixture")) return [];
  switch (path) {
    case "/v3/serp/google/organic/live/advanced":
      return [
        {
          type: "organic",
          rank_group: 1,
          rank_absolute: 1,
          title: "Acceptance rocket guide",
          url: keyword.includes("secondary")
            ? "https://primary.example/second-guide"
            : "https://primary.example/guide",
          domain: "primary.example",
          description: "A controlled provider transport result.",
          etv: 0,
          backlinks_info: { backlinks: 0, referring_domains: null },
        },
        {
          type: "organic",
          rank_group: 2,
          rank_absolute: 2,
          title: "Acceptance competitor guide",
          url: keyword.includes("secondary")
            ? "https://competitor.example/second-rocket"
            : "https://competitor.example/rocket",
          domain: "competitor.example",
          description: "Second isolated ranking result.",
        },
        {
          type: "people_also_ask",
          items: [{ title: "How do rockets launch?" }],
        },
      ];
    case "/v3/dataforseo_labs/google/related_keywords/live":
      return [
        keyword,
        `${keyword} guide`,
        `${keyword} guide checklist`,
        `${keyword} tools`,
      ].map((value) => ({ keyword_data: keywordRow(value) }));
    case "/v3/dataforseo_labs/google/keyword_suggestions/live":
    case "/v3/dataforseo_labs/google/keyword_ideas/live":
      return [
        keyword,
        `${keyword} tools`,
        `${keyword} tools guide`,
        `${keyword} launch`,
        `${keyword} launch checklist`,
      ].map((value, index) => keywordRow(value, index === 2 ? null : 120));
    case "/v3/dataforseo_labs/google/keyword_overview/live":
      return strings(input.keywords).map((value) =>
        keywordRow(value, value.includes("zero") ? 0 : 120),
      );
    case "/v3/dataforseo_labs/google/ranked_keywords/live":
      return [
        {
          keyword_data: keywordRow("operation page keyword", 0),
          ranked_serp_element: {
            serp_item: {
              url: `https://${text(input.target, "primary.com")}/guide`,
              relative_url: "/guide",
              rank_absolute: 8,
              etv: null,
            },
          },
        },
      ];
    case "/v3/dataforseo_labs/google/bulk_traffic_estimation/live":
      return strings(input.targets).map((target) => ({
        target,
        metrics: { organic: { etv: target === "primary.example" ? 0 : 125.5 } },
      }));
    case "/v3/keywords_data/google_trends/explore/live":
      return [
        {
          type: "google_trends_graph",
          keywords: strings(input.keywords),
          averages: strings(input.keywords).map(() => 25),
          data: [
            {
              date_from: "2026-09-01",
              date_to: "2026-09-07",
              timestamp: 1788220800,
              values: strings(input.keywords).map(() => 0),
            },
            {
              date_from: "2026-09-08",
              date_to: "2026-09-14",
              timestamp: 1788825600,
              values: strings(input.keywords).map(() => 50),
            },
          ],
        },
      ];
    case "/v3/on_page/instant_pages":
      return [
        {
          url: text(input.url),
          status_code: 200,
          meta: {
            title: "Acceptance outline",
            content: {
              plain_text_word_count: text(input.url).includes("primary.example")
                ? 0
                : -9,
            },
            htags: text(input.url).includes("primary.example")
              ? {
                  h2: [
                    "Preparing a rocket launch",
                    "Choosing launch equipment",
                  ],
                  h3: ["Safety checks"],
                }
              : undefined,
          },
        },
      ];
    case "/v3/business_data/google/my_business_info/live":
      return [
        {
          title:
            keyword === "Empty Citation Fixture Business"
              ? keyword
              : "Acceptance Rocket Business",
          category: "Rocket equipment",
          additional_categories: [],
          address: "Local fixture address",
          domain: "operation.example",
          url: "https://operation.example",
          latitude: 33.0137,
          longitude: -96.693,
          rating: { value: 0, votes_count: 0 },
          is_claimed: true,
        },
      ];
    case "/v3/serp/google/local_finder/live/advanced":
      return [
        {
          type: "local_pack",
          rank_group: 2,
          title: "Acceptance Rocket Business",
          domain: "operation.example",
          url: "https://operation.example",
        },
        {
          type: "local_pack",
          rank_group: 1,
          title: "Acceptance local competitor",
          domain: "competitor.example",
        },
      ];
    case "/v3/business_data/google/reviews/task_post":
      return [];
    case "/v3/ai_optimization/llm_mentions/search/live":
      return [
        {
          question: "Acceptance rocket question",
          ai_search_volume: 0,
          monthly_searches: [
            { year: 2026, month: 9, search_volume: 0 },
            { year: 2026, month: 10, search_volume: null },
          ],
          sources: [
            {
              url: "https://operation.example/guide",
              title: "Acceptance rocket source",
            },
          ],
          first_response_at: "2026-10-01T00:00:00Z",
          last_response_at: "2026-10-01T00:00:00Z",
        },
      ];
    case "/v3/ai_optimization/llm_mentions/top_pages/live":
      return [
        {
          key: "https://operation.example/guide",
          platform: [{ key: input.platform, mentions: 3, ai_search_volume: 0 }],
        },
      ];
    case "/v3/ai_optimization/llm_mentions/cross_aggregated_metrics/live":
      return Array.isArray(input.targets)
        ? input.targets.map((group: unknown) => ({
            key:
              typeof group === "object" &&
              group !== null &&
              "aggregation_key" in group &&
              typeof group.aggregation_key === "string"
                ? group.aggregation_key
                : "unknown",
            platform: [
              { key: input.platform, mentions: 0, ai_search_volume: 0 },
            ],
          }))
        : [];
    case "/v3/ai_optimization/llm_mentions/aggregated_metrics/live":
    case "/v3/ai_optimization/chat_gpt/llm_responses/live":
    case "/v3/ai_optimization/claude/llm_responses/live":
    case "/v3/ai_optimization/gemini/llm_responses/live":
    case "/v3/ai_optimization/perplexity/llm_responses/live":
      return [];
    case "/v3/dataforseo_labs/google/competitors_domain/live":
      return ["competitor.com", "other-competitor.com"].map(
        (domain, index) => ({
          domain,
          avg_position: index + 2,
          intersections: index === 0 ? 10 : 0,
          full_domain_metrics: {
            organic: {
              count: index === 0 ? 100 : 0,
              etv: index === 0 ? 125.5 : 0,
            },
          },
        }),
      );
    case "/v3/dataforseo_labs/google/serp_competitors/live":
      return [
        {
          domain: "competitor.example",
          avg_position: 2,
          keywords_count: 1,
          etv: 120,
          keywords_positions: Object.fromEntries(
            strings(input.keywords).map((term) => [term, [2]]),
          ),
        },
      ];
    default:
      return backlinkFixtureItems(path, input);
  }
}

function backlinkFixtureItems(
  path: string,
  input: TaskInput,
): unknown[] | null {
  switch (path) {
    case "/v3/backlinks/summary/live":
      return [
        {
          target: input.target,
          rank: 0,
          backlinks: 2,
          referring_pages: 2,
          referring_domains: 2,
          broken_backlinks: 0,
          broken_pages: null,
          new_backlinks: 0,
          lost_backlinks: null,
          new_referring_domains: 0,
          lost_referring_domains: null,
          backlinks_spam_score: 0,
          referring_domains_nofollow: 0,
          referring_pages_nofollow: 0,
          referring_links_types: { anchor: 2 },
          info: { target_spam_score: 0 },
        },
      ];
    case "/v3/dataforseo_labs/google/domain_intersection/live":
      return [
        {
          keyword_data: {
            keyword: "contract gap unknown",
            keyword_info: {
              search_volume: null,
              cpc: 0.1234,
              competition: null,
            },
            keyword_properties: { keyword_difficulty: null },
          },
          first_domain_serp_element: { rank_absolute: 3 },
          second_domain_serp_element: { rank_absolute: null },
        },
        {
          keyword_data: {
            keyword: "contract gap zero",
            keyword_info: { search_volume: 0, cpc: 0, competition: 0 },
            keyword_properties: { keyword_difficulty: 0 },
          },
          first_domain_serp_element: { rank_absolute: 4 },
          second_domain_serp_element: { rank_absolute: null },
        },
      ];
    case "/v3/backlinks/history/live":
      return [
        { date: "2026-09-01", backlinks: 0, referring_domains: 0, rank: 0 },
      ];
    case "/v3/backlinks/backlinks/live":
      return ["source-a.example", "source-b.example"].map((domain, index) => ({
        domain_from: domain,
        url_from: `https://${domain}/acceptance-source`,
        url_to: backlinkTargetUrl(input),
        anchor: "operation rocket link",
        dofollow: true,
        rank: index === 0 ? 20 : 8,
        domain_from_rank: index === 0 ? 0 : null,
        links_count: 1,
        backlinks_spam_score: 0,
        first_seen: "2026-09-01T00:00:00.000Z",
        last_visited: "2026-09-29T00:00:00.000Z",
        is_new: false,
        is_lost: false,
      }));
    case "/v3/backlinks/referring_domains/live":
      return [
        {
          domain: "source-a.example",
          backlinks: 1,
          referring_pages: 1,
          rank: 0,
          first_seen: "2026-09-01T00:00:00Z",
          backlinks_spam_score: 0,
        },
      ];
    case "/v3/backlinks/domain_intersection/live":
      return [
        {
          domain_intersection: {
            "1": {
              target: "linker.example",
              rank: 0,
              backlinks: 0,
              backlinks_spam_score: 0,
              first_seen: null,
            },
          },
        },
      ];
    case "/v3/backlinks/domain_pages_summary/live":
      return [
        {
          page: backlinkTargetUrl(input),
          backlinks: 2,
          referring_domains: 2,
          rank: 0,
        },
      ];
    case "/v3/backlinks/anchors/live":
      return [
        {
          anchor: "operation rocket link",
          backlinks: 2,
          referring_domains: 2,
          rank: 0,
        },
      ];
    default:
      return null;
  }
}
