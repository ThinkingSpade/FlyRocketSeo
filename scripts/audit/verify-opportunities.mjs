import assert from "node:assert/strict";
import test from "node:test";
import {
  createHarness,
  fixture,
  healthyPage,
  nodes,
  text,
  tile,
} from "./opportunities-harness.mjs";

function noAudit() {
  return fixture({
    history: { isError: false, isPending: false, data: [] },
    audit: { isError: false, isPending: true, data: undefined },
  });
}

// These tests execute real production page/model logic with explicit test doubles.
// They do not certify real React rendering, provider responses, or authentication.
test("a disabled audit query does not hide the no-audit action", () => {
  const harness = createHarness(noAudit());
  const tree = harness.render();
  assert.match(text(tree), /No site audit yet/);
  assert.equal(nodes(tree, "Loader").length, 0);
  assert.ok(
    nodes(tree, "Link").some((item) => item.props.to === "/p/$projectId/audit"),
  );
  assert.equal(
    harness.calls.queries.find((item) => item.queryKey[0] === "auditResults")
      .enabled,
    false,
  );
  assert.equal(harness.calls.serverCalls.length, 0);
});

test("no audit is unavailable, not zero technical findings", () => {
  const tree = createHarness(noAudit()).render();
  assert.equal(tile(tree, "Pages affected").value, "—");
});

test("loading audit history does not publish zero findings", () => {
  const state = noAudit();
  state.history.isPending = true;
  const tree = createHarness(state).render();
  assert.equal(tile(tree, "Pages affected").value, "—");
  assert.equal(nodes(tree, "Loader").length, 1);
});

test("a completed audit with no page evidence is not a clean bill of health", () => {
  const state = fixture();
  state.audit.data.pages = [];
  const tree = createHarness(state).render();
  assert.equal(tile(tree, "Pages affected").value, "—");
  assert.match(text(tree), /No page evidence/i);
  assert.doesNotMatch(text(tree), /clean sweep/i);
});

test("a usable audit can report a genuine zero", () => {
  const tree = createHarness().render();
  assert.equal(tile(tree, "Pages affected").value, "0");
});

test("one URL with three findings counts as one affected page", () => {
  const state = fixture();
  state.audit.data.pages = [
    healthyPage({ title: "", metaDescription: "", h1Count: 0 }),
  ];
  assert.equal(
    tile(createHarness(state).render(), "Pages affected").value,
    "1",
  );
});

test("unique page counts do not use the three-example display cap", () => {
  const state = fixture();
  state.audit.data.pages = Array.from({ length: 7 }, (_, index) =>
    healthyPage({
      url: `https://fixture.invalid/${index}`,
      title: "",
      metaDescription: "",
    }),
  );
  assert.equal(
    tile(createHarness(state).render(), "Pages affected").value,
    "7",
  );
});

test("audit result failure remains retryable and unavailable", () => {
  const state = fixture();
  state.audit = { isError: true, isPending: false, data: undefined };
  const harness = createHarness(state);
  const tree = harness.render();
  assert.equal(tile(tree, "Pages affected").value, "—");
  nodes(tree, "InlineQueryError")[0].props.onRetry();
  assert.deepEqual(harness.calls.retries, ["audit"]);
});

test("failed fetches do not invent metadata defects", () => {
  const { buildTechnicalIssues } = createHarness().load("opportunityModel.ts");
  const issues = buildTechnicalIssues([
    healthyPage({
      statusCode: 404,
      title: null,
      metaDescription: null,
      h1Count: 0,
    }),
  ]);
  assert.deepEqual(
    issues.map((item) => item.key),
    ["status"],
  );
});

test("unknown fetch evidence is named instead of diagnosed as missing metadata", () => {
  const { buildTechnicalIssues } = createHarness().load("opportunityModel.ts");
  const issues = buildTechnicalIssues([
    healthyPage({
      statusCode: null,
      title: null,
      metaDescription: null,
      h1Count: 0,
    }),
  ]);
  assert.deepEqual(
    issues.map((item) => item.key),
    ["unverified"],
  );
});

test("redirects are not classified as confirmed HTTP failures", () => {
  const { buildTechnicalIssues } = createHarness().load("opportunityModel.ts");
  const issues = buildTechnicalIssues([
    healthyPage({
      statusCode: 301,
      title: null,
      metaDescription: null,
      h1Count: 0,
    }),
  ]);
  assert.deepEqual(
    issues.map((item) => item.key),
    ["redirect"],
  );
});

test("duplicate stored URLs do not inflate category counts", () => {
  const { buildTechnicalIssues } = createHarness().load("opportunityModel.ts");
  const page = healthyPage({ title: "" });
  const issues = buildTechnicalIssues([page, page]);
  assert.equal(issues.find((item) => item.key === "title").pageCount, 1);
});

test("an absent successful GSC payload is not equivalent to zero results", () => {
  const { isSourceUnavailable } = createHarness().load("opportunityModel.ts");
  assert.equal(
    isSourceUnavailable({ isError: false, isPending: false }, undefined),
    true,
  );
});

test("the headline does not add overlapping hypothetical scenarios", () => {
  const state = fixture();
  state.report.data.strikingDistance = [
    {
      query: "widgets",
      page: "https://fixture.invalid/a",
      impressions: 1000,
      position: 8,
    },
  ];
  state.links.data.cannibalization = [
    {
      query: "widgets",
      totalImpressions: 1000,
      splitShare: 0.5,
      severity: "high",
      pages: [
        { page: "https://fixture.invalid/a", isWinner: true },
        { page: "https://fixture.invalid/b", isWinner: false },
      ],
    },
  ];
  const tree = createHarness(state).render();
  assert.equal(tile(tree, "Largest click scenario").value, "80");
  assert.equal(nodes(tree, "OpportunityRow").length, 2);
  assert.match(text(tree), /not a forecast/i);
  assert.doesNotMatch(text(tree), /extra monthly clicks|Estimated monthly/i);
});

test("short content is described as a review heuristic, not a ranking rule", () => {
  const { buildTechnicalIssues } = createHarness().load("opportunityModel.ts");
  const issue = buildTechnicalIssues([healthyPage({ wordCount: 120 })]).find(
    (item) => item.key === "thin",
  );
  assert.ok(issue);
  assert.doesNotMatch(issue.description, /too little to rank/i);
  assert.match(issue.description, /word count alone/i);
});

test("missing resolved audit results have a retry path instead of a healthy zero", () => {
  const state = fixture();
  state.audit.data = undefined;
  const harness = createHarness(state);
  const tree = harness.render();
  assert.equal(tile(tree, "Pages affected").value, "—");
  assert.equal(nodes(tree, "Loader").length, 0);
  nodes(tree, "InlineQueryError")[0].props.onRetry();
  assert.deepEqual(harness.calls.retries, ["audit"]);
});

test("history failures retry history rather than a disabled result query", () => {
  const state = noAudit();
  state.history.isError = true;
  const harness = createHarness(state);
  const tree = harness.render();
  nodes(tree, "InlineQueryError")[0].props.onRetry();
  assert.deepEqual(harness.calls.retries, ["history"]);
  assert.equal(tile(tree, "Pages affected").value, "—");
});

test("distinct query-string URLs are not silently canonicalized together", () => {
  const { summarizeTechnicalIssues } =
    createHarness().load("technicalIssues.ts");
  const summary = summarizeTechnicalIssues([
    healthyPage({ url: "https://fixture.invalid/?id=1", title: "" }),
    healthyPage({ url: "https://fixture.invalid/?id=2", title: "" }),
  ]);
  assert.equal(summary.affectedPages, 2);
});

test("non-finite click inputs cannot become realistic-looking opportunities", () => {
  const { quickWinClicks, buildOpportunities } = createHarness().load(
    "opportunityModel.ts",
  );
  for (const [impressions, position] of [
    [1000, NaN],
    [1000, 0],
    [Infinity, 8],
    [-1000, 8],
  ]) {
    assert.equal(quickWinClicks(impressions, position), 0);
  }
  const rows = buildOpportunities({
    strikingDistance: [
      {
        query: "bad",
        page: "https://fixture.invalid/a",
        impressions: Infinity,
        position: 8,
      },
    ],
    ctrOpportunities: [
      {
        query: "bad",
        page: "https://fixture.invalid/b",
        impressions: 100,
        position: 2,
        missedClicks: Infinity,
      },
    ],
    cannibalization: [],
  });
  assert.deepEqual(rows, []);
});

test("fractional HTTP statuses stay unverified, not confirmed response failures", () => {
  const { buildTechnicalIssues } = createHarness().load("opportunityModel.ts");
  assert.deepEqual(
    buildTechnicalIssues([healthyPage({ statusCode: 404.5 })]).map(
      (item) => item.key,
    ),
    ["unverified"],
  );
});
