import { describe, expect, it } from "vitest";
import {
  labelToCityQuery,
  parseCityHosts,
  toBaseDomain,
} from "./parseCityHosts";

const LIMIT = 2000;

function parse(input: string, baseDomain?: string) {
  return parseCityHosts(input, { baseDomain, limit: LIMIT });
}

describe("parseCityHosts", () => {
  it("parses one host per line", () => {
    const result = parse(
      "austin.example.com\ndallas.example.com\n",
      "example.com",
    );
    expect(result.hosts.map((host) => host.host)).toEqual([
      "austin.example.com",
      "dallas.example.com",
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.truncatedCount).toBe(0);
  });

  it("strips scheme, port, path, quotes and trailing dots", () => {
    const result = parse(
      [
        "https://austin.example.com/locations?a=1",
        "http://dallas.example.com:8080",
        '"houston.example.com."',
        "<phoenix.example.com>",
      ].join("\n"),
      "example.com",
    );
    expect(result.hosts.map((host) => host.host)).toEqual([
      "austin.example.com",
      "dallas.example.com",
      "houston.example.com",
      "phoenix.example.com",
    ]);
  });

  it("keeps every host on a comma-separated line", () => {
    const result = parse(
      "austin.example.com, dallas.example.com;houston.example.com",
      "example.com",
    );
    expect(result.hosts).toHaveLength(3);
  });

  it("ignores trailing CSV columns that are not hosts", () => {
    const result = parse("austin.example.com,Austin,TX", "example.com");
    expect(result.hosts.map((host) => host.host)).toEqual([
      "austin.example.com",
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("skips blank lines and comments without reporting them", () => {
    const result = parse(
      "\n# generated list\n\naustin.example.com\n",
      "example.com",
    );
    expect(result.hosts).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it("reports lines that contain no hostname", () => {
    const result = parse("host,city,state\naustin.example.com", "example.com");
    expect(result.skipped).toEqual([
      { value: "host,city,state", reason: "not-a-hostname" },
    ]);
    expect(result.hosts).toHaveLength(1);
  });

  it("reports duplicates instead of merging them silently", () => {
    const result = parse(
      "austin.example.com\nAUSTIN.example.com\n",
      "example.com",
    );
    expect(result.hosts).toHaveLength(1);
    expect(result.skipped).toEqual([
      { value: "austin.example.com", reason: "duplicate" },
    ]);
  });

  it("rejects the apex domain itself as having no subdomain", () => {
    const result = parse("example.com\naustin.example.com", "example.com");
    expect(result.hosts.map((host) => host.host)).toEqual([
      "austin.example.com",
    ]);
    expect(result.skipped).toEqual([
      { value: "example.com", reason: "no-subdomain" },
    ]);
  });

  it("counts hosts dropped past the limit rather than hiding them", () => {
    const input = Array.from(
      { length: 5 },
      (_unused, index) => `city${index}.example.com`,
    ).join("\n");
    const result = parseCityHosts(input, {
      baseDomain: "example.com",
      limit: 3,
    });
    expect(result.hosts).toHaveLength(3);
    expect(result.truncatedCount).toBe(2);
  });

  it("rejects bare IP addresses", () => {
    const result = parse("10.0.0.1", "example.com");
    expect(result.hosts).toEqual([]);
    expect(result.skipped).toEqual([
      { value: "10.0.0.1", reason: "not-a-hostname" },
    ]);
  });

  describe("subdomain label", () => {
    it("strips the project's own domain, however deep the label", () => {
      const result = parse(
        "austin.tx.example.com\nsan-antonio.example.com",
        "example.com",
      );
      expect(
        result.hosts.map((host) => [host.subdomainLabel, host.cityQuery]),
      ).toEqual([
        ["austin.tx", "austin tx"],
        ["san-antonio", "san antonio"],
      ]);
    });

    it("falls back to the first label when no base domain is known", () => {
      const result = parse("austin.example.com");
      expect(result.hosts[0]?.subdomainLabel).toBe("austin");
    });

    it("does not treat a two-label host as a city when no domain is known", () => {
      const result = parse("example.com");
      expect(result.hosts).toEqual([]);
      expect(result.skipped[0]?.reason).toBe("no-subdomain");
    });

    it("keeps hosts that do not sit under the project domain", () => {
      const result = parse("austin.otherbrand.com", "example.com");
      expect(result.hosts[0]?.subdomainLabel).toBe("austin");
    });
  });

  describe("state hint", () => {
    it("splits the final token off as a possible state", () => {
      const result = parse("austin-tx.example.com", "example.com");
      expect(result.hosts[0]).toMatchObject({
        cityQuery: "austin tx",
        fallbackCityQuery: "austin",
        stateHint: "tx",
      });
    });

    it("leaves single-token labels with no fallback reading", () => {
      const result = parse("austin.example.com", "example.com");
      expect(result.hosts[0]).toMatchObject({
        cityQuery: "austin",
        fallbackCityQuery: null,
        stateHint: null,
      });
    });

    it("offers both readings for a multi-word city", () => {
      const result = parse("san-antonio.example.com", "example.com");
      expect(result.hosts[0]).toMatchObject({
        cityQuery: "san antonio",
        fallbackCityQuery: "san",
        stateHint: "antonio",
      });
    });
  });
});

describe("labelToCityQuery", () => {
  it("collapses every separator to a single space", () => {
    expect(labelToCityQuery("san--antonio_tx.north")).toBe(
      "san antonio tx north",
    );
  });

  it("drops apostrophes", () => {
    expect(labelToCityQuery("coeur-d'alene")).toBe("coeur dalene");
  });
});

describe("toBaseDomain", () => {
  it("normalizes a free-text project domain", () => {
    expect(toBaseDomain("https://example.com/")).toBe("example.com");
  });

  it("drops a www prefix so city subdomains still resolve", () => {
    expect(toBaseDomain("www.example.com")).toBe("example.com");
  });

  it("returns null for an unusable domain", () => {
    expect(toBaseDomain(null)).toBeNull();
    expect(toBaseDomain("")).toBeNull();
    expect(toBaseDomain("not a domain")).toBeNull();
  });
});
