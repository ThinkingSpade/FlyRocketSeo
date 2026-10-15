import { describe, expect, it } from "vitest";
import {
  MAX_DOMAIN_SESSION_RUNS,
  findDomainSessionRun,
  recordDomainSessionRun,
  storedDomainAnswers,
  type DomainSessionRun,
} from "./domainSessionRuns";

const US = 2840;

function run(
  domain: string,
  nonce: number,
  overrides: Partial<DomainSessionRun["input"]> = {},
): DomainSessionRun {
  return {
    input: {
      domain,
      includeSubdomains: true,
      locationCode: US,
      languageCode: "en",
      ...overrides,
    },
    nonce,
  };
}

const scope = (domain: string) => ({
  domain,
  includeSubdomains: true,
  locationCode: US,
});

describe("findDomainSessionRun", () => {
  it("answers nothing when the URL names no domain (Recent searches)", () => {
    expect(findDomainSessionRun([run("primary.com", 1)], null)).toBeNull();
    expect(
      findDomainSessionRun([run("primary.com", 1)], scope(" ")),
    ).toBeNull();
  });

  it("finds the run behind the tab the URL names, not the latest run", () => {
    const runs = [run("primary.com", 1), run("secondary.com", 2)];
    expect(findDomainSessionRun(runs, scope("primary.com"))?.nonce).toBe(1);
    expect(findDomainSessionRun(runs, scope("secondary.com"))?.nonce).toBe(2);
  });

  it("ignores case and surrounding space in the domain", () => {
    expect(
      findDomainSessionRun([run("primary.com", 1)], scope(" Primary.COM "))
        ?.nonce,
    ).toBe(1);
  });

  it("answers nothing for a tab never run this session", () => {
    expect(
      findDomainSessionRun([run("primary.com", 1)], scope("other.com")),
    ).toBeNull();
  });

  it("does not hand a run to a search with a different scope", () => {
    const runs = [run("primary.com", 1)];
    expect(
      findDomainSessionRun(runs, {
        ...scope("primary.com"),
        includeSubdomains: false,
      }),
    ).toBeNull();
    expect(
      findDomainSessionRun(runs, {
        ...scope("primary.com"),
        locationCode: 2826,
      }),
    ).toBeNull();
  });

  it("prefers the newest run when two cover the same tab", () => {
    const runs = [run("primary.com", 1), run("primary.com", 2)];
    expect(findDomainSessionRun(runs, scope("primary.com"))?.nonce).toBe(2);
  });
});

const url = (domain: string, locationCode = US) => ({ domain, locationCode });
const stored = (domain: string, locationCode: number | null = US) => ({
  domain,
  locationCode,
});

describe("storedDomainAnswers", () => {
  it("lets any stored run fill the view when the URL names no domain", () => {
    expect(storedDomainAnswers(url(""), stored("primary.com"))).toBe(true);
  });

  it("only lets a stored run stand in for the domain the URL names", () => {
    expect(storedDomainAnswers(url("primary.com"), stored("Primary.com"))).toBe(
      true,
    );
    expect(
      storedDomainAnswers(url("primary.com"), stored("secondary.com")),
    ).toBe(false);
  });

  it("requires the same market, since the overview numbers are per market", () => {
    expect(
      storedDomainAnswers(url("primary.com", 2826), stored("primary.com")),
    ).toBe(false);
    // A run stored before its market was recorded: unknown, so it does not
    // stand in for a specific one.
    expect(
      storedDomainAnswers(url("primary.com"), stored("primary.com", null)),
    ).toBe(false);
  });
});

describe("recordDomainSessionRun", () => {
  it("keeps a bounded list, dropping the oldest runs first", () => {
    let runs: DomainSessionRun[] = [];
    for (let nonce = 1; nonce <= MAX_DOMAIN_SESSION_RUNS + 2; nonce += 1) {
      runs = recordDomainSessionRun(runs, run(`d${nonce}.com`, nonce));
    }
    expect(runs).toHaveLength(MAX_DOMAIN_SESSION_RUNS);
    expect(runs[0]?.nonce).toBe(3);
  });
});
