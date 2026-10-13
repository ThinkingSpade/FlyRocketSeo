import { fixtureItems, text, type TaskInput } from "./provider-fixture-items";

export async function providerFixtureResponse(
  url: URL,
  init?: RequestInit,
): Promise<Response | null> {
  if (
    url.origin === "https://nominatim.openstreetmap.org" &&
    url.pathname === "/search" &&
    url.searchParams.get("q") === "Acceptance City"
  ) {
    return Response.json([
      {
        lat: "33.0136764",
        lon: "-96.6929754",
        display_name: "Acceptance City, United States",
      },
    ]);
  }
  if (
    url.origin === "https://api.ahrefs.com" &&
    url.pathname === "/v3/public/domain-rating-free"
  ) {
    return Response.json({ domain_rating: { domain_rating: 0 } });
  }
  if (url.origin !== "https://api.dataforseo.com") return null;
  if (
    url.pathname ===
      "/v3/business_data/google/reviews/task_get/acceptance-review-task" &&
    init?.method?.toUpperCase() === "GET" &&
    new Headers(init.headers).get("Authorization") ===
      "Basic acceptance-fake-dataforseo-key"
  ) {
    return Response.json({
      status_code: 20000,
      tasks: [
        {
          id: "acceptance-review-task",
          status_code: 20000,
          path: ["v3", "business_data", "google", "reviews", "task_get"],
          cost: 0,
          result_count: 1,
          result: [
            {
              keyword: "Acceptance Rocket Business",
              location_code: 2840,
              language_code: "en",
              rating: { value: 0 },
              reviews_count: 0,
              items: [
                {
                  review_id: "acceptance-review",
                  rating: { value: 0 },
                  review_text: "Acceptance review from isolated fixture",
                  profile_name: "Local test reviewer",
                  timestamp: "2026-09-28T12:00:00.000Z",
                  owner_answer: null,
                },
              ],
            },
          ],
        },
      ],
    });
  }
  if (
    init?.method?.toUpperCase() !== "POST" ||
    new Headers(init.headers).get("Authorization") !==
      "Basic acceptance-fake-dataforseo-key"
  )
    return null;
  const inputs: unknown =
    typeof init.body === "string" ? JSON.parse(init.body) : null;
  if (
    !Array.isArray(inputs) ||
    inputs.length !== 1 ||
    !inputs[0] ||
    typeof inputs[0] !== "object"
  )
    return null;
  const inputValue: unknown = inputs[0];
  if (
    typeof inputValue !== "object" ||
    inputValue === null ||
    Array.isArray(inputValue)
  )
    return null;
  const input: TaskInput = Object.fromEntries(Object.entries(inputValue));
  const items = fixtureItems(url.pathname, input);
  if (items === null) return null;
  if (url.pathname === "/v3/business_data/google/reviews/task_post") {
    return Response.json({
      status_code: 20000,
      tasks: [
        {
          id: "acceptance-review-task",
          status_code: 20100,
          status_message: "Task Created",
          path: url.pathname.slice(1).split("/"),
          cost: 0,
          result_count: 0,
          result: [],
        },
      ],
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (text(input.keyword, "").includes("operation failure"))
    return new Response("Isolated fixture provider unavailable", {
      status: 503,
    });
  const result =
    url.pathname === "/v3/backlinks/summary/live"
      ? items
      : url.pathname ===
          "/v3/ai_optimization/llm_mentions/aggregated_metrics/live"
        ? [
            {
              total: {
                platform: [
                  { key: input.platform, mentions: 3, ai_search_volume: 0 },
                ],
              },
            },
          ]
        : url.pathname.includes("/llm_responses/")
          ? [
              {
                model_name: input.model_name,
                output_tokens: 0,
                web_search: input.web_search,
                items: [
                  {
                    type: "message",
                    sections: [
                      {
                        type: "text",
                        text: "Acceptance fixture answer about operation rockets.",
                        annotations: [
                          {
                            url: "https://operation.example/guide",
                            title: "Acceptance guide",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ]
          : [
              {
                items,
                total_count:
                  url.pathname ===
                  "/v3/dataforseo_labs/google/ranked_keywords/live"
                    ? null
                    : items.length,
                target: input.target,
                target1: input.target_1 ?? input.target1,
                target2: input.target_2 ?? input.target2,
                keyword: input.keyword,
                location_code: input.location_code,
                language_code: input.language_code,
              },
            ];
  return Response.json({
    version: "acceptance-fixture",
    status_code: 20000,
    status_message: "Ok.",
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: "acceptance-provider-task",
        status_code: 20000,
        status_message: "Ok.",
        cost: 0,
        path: url.pathname.slice(1).split("/"),
        result_count: 1,
        data: input,
        result,
      },
    ],
  });
}
