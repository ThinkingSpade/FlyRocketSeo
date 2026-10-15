import { describe, expect, it } from "vitest";
import {
  readCollapsedGroups,
  writeCollapsedGroups,
} from "./navigationPreferences";

const labels = [
  "Overview",
  "Research",
  "Optimize",
  "Track",
  "Manage",
  "Connect",
];
describe("navigation preferences", () => {
  it("keeps the first visit fully discoverable", () => {
    expect(readCollapsedGroups({ getItem: () => null }, labels)).toEqual([]);
  });
  it("restores only known group labels without duplicates", () => {
    const storage = {
      getItem: () => '["Research","Unknown","Research",42,"Track"]',
    };
    expect(readCollapsedGroups(storage, labels)).toEqual(["Research", "Track"]);
  });
  it("degrades safely when browser storage is denied or corrupt", () => {
    expect(
      readCollapsedGroups(
        {
          getItem: () => {
            throw new Error("Denied");
          },
        },
        labels,
      ),
    ).toEqual([]);
    expect(readCollapsedGroups({ getItem: () => "not json" }, labels)).toEqual(
      [],
    );
    expect(
      readCollapsedGroups({ getItem: () => '{"Research":true}' }, labels),
    ).toEqual([]);
  });
  it("persists only layout choices, never project data", () => {
    const calls: string[][] = [];
    writeCollapsedGroups(
      {
        setItem: (key, value) => {
          calls.push([key, value]);
        },
      },
      ["Track"],
    );
    expect(calls).toEqual([["flyrocketseo:nav-collapsed:v1", '["Track"]']]);
  });
  it("storage failure does not block navigation", () => {
    expect(() =>
      writeCollapsedGroups(
        {
          setItem: () => {
            throw new Error("Denied");
          },
        },
        [],
      ),
    ).not.toThrow();
  });
});
