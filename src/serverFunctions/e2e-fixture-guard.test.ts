import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDomainOverview } from "./domain";
import { researchKeywords } from "./keywords";

const adapters = vi.hoisted(() => ({
  domain: vi.fn().mockResolvedValue({ source: "normal-domain-adapter" }),
  keywords: vi.fn().mockResolvedValue({ source: "normal-keyword-adapter" }),
  domainFixture: vi.fn(),
  keywordFixture: vi.fn().mockResolvedValue({ source: "keyword-fixture" }),
}));

const validDomainFixture = {
  domain: "example.com",
  organicTraffic: 12.5,
  organicKeywords: 12,
  backlinks: null,
  referringDomains: null,
  positionBuckets: null,
  hasData: true,
  fetchedAt: "2026-10-01T00:00:00.000Z",
};

// Exercise actual handler selection; adapters are inert and auth is covered
// separately by the hosted browser suite.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(handler: unknown) {
      return handler;
    },
  }),
}));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@/server/features/domain/services/DomainService", () => ({
  DomainService: { getOverview: adapters.domain },
}));
vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: { research: adapters.keywords },
}));
vi.mock("../../e2e/fixtures/domain-overview-fixtures", () => ({
  getFixtureOverview: adapters.domainFixture,
}));
vi.mock("../../e2e/fixtures/keyword-research-fixtures", () => ({
  getKeywordResearchFixture: adapters.keywordFixture,
}));

const context = {
  projectId: "project-1",
  organizationId: "org-1",
  userId: "user-1",
  userEmail: "local@example.com",
};
const domainRequest = {
  data: {
    projectId: "project-1",
    domain: "example.com",
    includeSubdomains: true,
    locationCode: 2840,
    languageCode: "en",
  },
  context,
};
const keywordRequest = {
  data: {
    projectId: "project-1",
    keywords: ["example"],
    locationCode: 2840,
    resultLimit: 150 as const,
    mode: "auto" as const,
    clickstream: false,
  },
  context,
};

beforeEach(() => {
  vi.clearAllMocks();
  adapters.domain.mockResolvedValue({ source: "normal-domain-adapter" });
  adapters.keywords.mockResolvedValue({ source: "normal-keyword-adapter" });
  adapters.domainFixture.mockReturnValue(validDomainFixture);
  adapters.keywordFixture.mockResolvedValue({ source: "keyword-fixture" });
});
afterEach(() => vi.unstubAllEnvs());

describe("local provider fixture boundary", () => {
  it("keeps normal adapters when a local fixture marker is not explicitly enabled", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "0");
    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "0");
    await expect(getDomainOverview(domainRequest)).resolves.toMatchObject({
      source: "normal-domain-adapter",
    });
    await expect(researchKeywords(keywordRequest)).resolves.toMatchObject({
      source: "normal-keyword-adapter",
    });
    expect(adapters.domainFixture).not.toHaveBeenCalled();
    expect(adapters.keywordFixture).not.toHaveBeenCalled();
  });
  it("ignores a domain fixture flag in a production runtime", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "1");
    await expect(getDomainOverview(domainRequest)).resolves.toMatchObject({
      source: "normal-domain-adapter",
    });
    expect(adapters.domainFixture).not.toHaveBeenCalled();
  });

  it("ignores a keyword fixture flag in a production runtime", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "1");
    await expect(researchKeywords(keywordRequest)).resolves.toMatchObject({
      source: "normal-keyword-adapter",
    });
    expect(adapters.keywordFixture).not.toHaveBeenCalled();
  });

  it("keeps explicit fixtures available during local development", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_E2E_DOMAIN_FIXTURES", "1");
    vi.stubEnv("VITE_E2E_KEYWORD_FIXTURES", "1");
    await expect(getDomainOverview(domainRequest)).resolves.toMatchObject({
      ...validDomainFixture,
      contractVersion: 2,
      source: "DataForSEO Labs",
      scope: {
        locationCode: 2840,
        languageCode: "en",
        includeSubdomains: true,
      },
    });
    await expect(researchKeywords(keywordRequest)).resolves.toMatchObject({
      source: "keyword-fixture",
    });
    expect(adapters.domain).not.toHaveBeenCalled();
    expect(adapters.keywords).not.toHaveBeenCalled();
  });
});
