import { describe, expect, it } from "vitest";
import { parseRecoveryEmail, parseResetPasswordForm, resetPasswordPath } from "./account-recovery-form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("staff recovery validation", () => {
  it("normalises staff email and rejects invalid addresses", () => {
    expect(parseRecoveryEmail(form({ email: "  Staff@Brandbasket.in " }))).toEqual({ success: true, email: "staff@brandbasket.in" });
    expect(parseRecoveryEmail(form({ email: "invalid" })).success).toBe(false);
    expect(parseRecoveryEmail(new FormData()).success).toBe(false);
  });

  it("accepts a complete token and matching strong password", () => {
    expect(parseResetPasswordForm(form({ token: "valid-token", password: "New-password8!", confirmPassword: "New-password8!" })))
      .toEqual({ success: true, token: "valid-token", password: "New-password8!" });
  });

  it.each([
    { token: "", password: "New-password8!", confirmPassword: "New-password8!" },
    { token: "x".repeat(201), password: "New-password8!", confirmPassword: "New-password8!" },
    { token: "valid", password: "weakpassword", confirmPassword: "weakpassword" },
    { token: "valid", password: "New-password8!", confirmPassword: "Different8!" },
  ])("rejects invalid reset input: %j", (values) => {
    expect(parseResetPasswordForm(form(values)).success).toBe(false);
  });

  it("encodes a reset token as one URL segment", () => {
    expect(resetPasswordPath("a/b?c")).toBe("/reset-password/a%2Fb%3Fc");
  });
});
