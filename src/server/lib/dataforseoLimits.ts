// SDK-free DataForSEO request limits. Lives outside dataforseo/serp.ts so
// callers that only need the batch size (e.g. the rank-check workflow) don't
// pull the dataforseo-client SDK into the Worker startup graph to read a number.

/** DataForSEO's task_post accepts 1–100 tasks per request. */
export const MAX_TASKS_PER_POST = 100;
