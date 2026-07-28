import { describe, expect, it } from "vitest";
import { isEmailVerificationBypassed } from "./auth-mode";

describe("email verification runtime config", () => {
  it("bypasses verification only when the server-provided flag is true", () => {
    expect(isEmailVerificationBypassed(true)).toBe(true);
    expect(isEmailVerificationBypassed(false)).toBe(false);
    expect(isEmailVerificationBypassed(undefined)).toBe(false);
  });
});
