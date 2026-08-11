import { describe, expect, it } from "vitest";
import { buildProfileBlock } from "./promptProfile";

const profile = {
  offer: "Placing and restocking vending machines",
  customer: "Office and warehouse facilities managers in DFW",
  exclusions: "We do not sell vending machines",
};

describe("buildProfileBlock", () => {
  it("states the exclusions as a rule, not as background", () => {
    // The regression this guards. On-Page Fixes is the one feature whose whole
    // output is marketing prose about the business, and the page it rewrites
    // says "vending machines" whether the client sells them or places them --
    // so without an explicit prohibition the model suggests "Buy Vending
    // Machines" to an operator who only places them.
    const block = buildProfileBlock(profile).join("\n");

    expect(block).toContain("Does NOT offer: We do not sell vending machines");
    expect(block).toContain("Never imply the business provides anything");
  });

  it("carries what the business sells and who it sells to", () => {
    const block = buildProfileBlock(profile).join("\n");

    expect(block).toContain("Sells: Placing and restocking vending machines");
    expect(block).toContain("Sells to: Office and warehouse facilities");
  });

  it("says nothing without a confirmed profile", () => {
    // Null is both "never filled in" and "an AI draft nobody accepted".
    expect(buildProfileBlock(null)).toEqual([]);
  });

  it("stays silent when there is no offer or customer to describe", () => {
    expect(
      buildProfileBlock({
        offer: "  ",
        customer: "",
        exclusions: "no repairs",
      }),
    ).toEqual([]);
  });

  it("omits the prohibition when there are no exclusions", () => {
    const block = buildProfileBlock({ ...profile, exclusions: "  " }).join(
      "\n",
    );

    expect(block).toContain("Sells:");
    expect(block).not.toContain("Never imply");
  });
});
