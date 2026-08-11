import { describe, expect, it } from "vitest";
import { classifyCompetitorDomain } from "./classifyCompetitorDomain";

describe("classifyCompetitorDomain", () => {
  // The brief's own "cover at minimum" list (one canonical domain per
  // category), plus the two extra brands (twitter.com, bing.com) named
  // alongside their siblings in that same list.
  it.each([
    ["youtube.com", "video"],
    ["facebook.com", "social"],
    ["instagram.com", "social"],
    ["tiktok.com", "social"],
    ["x.com", "social"],
    ["twitter.com", "social"],
    ["linkedin.com", "social"],
    ["pinterest.com", "social"],
    ["reddit.com", "social"],
    ["quora.com", "qa_forum"],
    ["amazon.com", "marketplace"],
    ["ebay.com", "marketplace"],
    ["walmart.com", "marketplace"],
    ["etsy.com", "marketplace"],
    ["alibaba.com", "marketplace"],
    ["yelp.com", "directory"],
    ["yellowpages.com", "directory"],
    ["bbb.org", "directory"],
    ["mapquest.com", "directory"],
    ["tripadvisor.com", "directory"],
    ["angi.com", "directory"],
    ["thumbtack.com", "directory"],
    ["franchisedirect.com", "directory"],
    ["indeed.com", "directory"],
    ["glassdoor.com", "directory"],
    ["wikipedia.org", "education"],
    ["google.com", "search_engine"],
    ["bing.com", "search_engine"],
  ] as const)("classifies %s as %s", (domain, category) => {
    expect(classifyCompetitorDomain(domain)).toBe(category);
  });

  it("classifies an obvious news domain as news", () => {
    expect(classifyCompetitorDomain("cnn.com")).toBe("news");
    expect(classifyCompetitorDomain("nytimes.com")).toBe("news");
  });

  it("returns null for a domain it has never heard of -- the default is 'competitor', not 'unknown'", () => {
    expect(classifyCompetitorDomain("vendingexchange.com")).toBeNull();
    expect(classifyCompetitorDomain("afvusa.com")).toBeNull();
    expect(classifyCompetitorDomain("acme-plumbing.com")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(classifyCompetitorDomain("YouTube.com")).toBe("video");
    expect(classifyCompetitorDomain("FACEBOOK.COM")).toBe("social");
  });

  it("strips a leading www. the same way discovered rows are normalized upstream", () => {
    expect(classifyCompetitorDomain("www.youtube.com")).toBe("video");
  });

  it("collapses an arbitrary subdomain to the registrable domain -- covers the brief's own m.facebook.com/en.wikipedia.org examples cheaply via eTLD+1, not a hardcoded list entry per prefix", () => {
    expect(classifyCompetitorDomain("m.facebook.com")).toBe("social");
    expect(classifyCompetitorDomain("en.wikipedia.org")).toBe("education");
    expect(classifyCompetitorDomain("en.m.wikipedia.org")).toBe("education");
    expect(classifyCompetitorDomain("news.google.com")).toBe("search_engine");
  });

  it("classifies a .edu domain as education via the TLD heuristic, with no per-university list entry", () => {
    expect(classifyCompetitorDomain("harvard.edu")).toBe("education");
    expect(classifyCompetitorDomain("www.mit.edu")).toBe("education");
  });

  it("classifies a Commonwealth academic domain (.ac.uk) as education via the same heuristic", () => {
    expect(classifyCompetitorDomain("ox.ac.uk")).toBe("education");
  });

  it("does not substring-match a lookalike domain that merely contains a listed brand name", () => {
    // Registrable domain is "facebook-marketing-agency.com", not
    // "facebook.com" -- a substring/contains check would wrongly classify
    // this as social; exact eTLD+1 lookup must not.
    expect(
      classifyCompetitorDomain("facebook-marketing-agency.com"),
    ).toBeNull();
    expect(classifyCompetitorDomain("myredditclone.com")).toBeNull();
  });

  it("handles an empty or whitespace-only domain without throwing", () => {
    expect(classifyCompetitorDomain("")).toBeNull();
    expect(classifyCompetitorDomain("   ")).toBeNull();
  });

  it("classifies every production-fixture non-competitor domain from the AmericaVending.com run", () => {
    expect(classifyCompetitorDomain("youtube.com")).toBe("video");
    expect(classifyCompetitorDomain("facebook.com")).toBe("social");
    expect(classifyCompetitorDomain("reddit.com")).toBe("social");
    expect(classifyCompetitorDomain("yellowpages.com")).toBe("directory");
    expect(classifyCompetitorDomain("amazon.com")).toBe("marketplace");
    expect(classifyCompetitorDomain("franchisedirect.com")).toBe("directory");
  });

  it("leaves every genuine vending-industry competitor from that same run unclassified", () => {
    // These are real operators/brands the task explicitly calls out as
    // genuine rivals -- none belongs in the static list, and none happens to
    // share a registrable domain with anything that is.
    for (const domain of [
      "vmfsusa.com",
      "vendingexchange.com",
      "canteen.com",
      "dfyvending.com",
      "vendingconcepts.com",
      "afvusa.com",
    ]) {
      expect(classifyCompetitorDomain(domain)).toBeNull();
    }
  });
});
