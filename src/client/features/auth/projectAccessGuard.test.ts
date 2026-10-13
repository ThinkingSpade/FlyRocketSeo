import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Executes the real route-control code with explicit query and UI doubles.
// This protects redirects/retry wiring; it does not certify server authorization.
describe("project access route recovery", () => {
  it("keeps service failures retryable without weakening auth redirects", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/audit/verify-project-access.mjs"],
      { encoding: "utf8" },
    );
    expect(output).toContain("PASS: four retryable errors");
  });
});
