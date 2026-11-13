import { describe, expect, it } from "vitest";
import { parseResetPasswordForm, resetPasswordPath } from "./account-recovery-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const GOOD = "correct-horse-battery-9!";

describe("parseResetPasswordForm", () => {
  it("reads the token and a new password typed twice", () => {
    expect(parseResetPasswordForm(form({ token: "abc", password: GOOD, confirmPassword: GOOD }))).toEqual({ success: true, token: "abc", password: GOOD });
  });

  it("refuses a missing or overlong token", () => {
    for (const token of ["", "x".repeat(201)]) {
      expect(parseResetPasswordForm(form({ token, password: GOOD, confirmPassword: GOOD }))).toEqual({
        success: false,
        message: "This link is incomplete. Open the link from your email again.",
      });
    }
  });

  it("refuses passwords that do not match, or break the rule", () => {
    expect(parseResetPasswordForm(form({ token: "abc", password: GOOD, confirmPassword: "other" }))).toEqual({ success: false, message: "Both passwords must match." });
    expect(parseResetPasswordForm(form({ token: "abc", password: "short", confirmPassword: "short" }))).toMatchObject({ success: false });
  });
});

it("puts the token in one path segment", () => {
  expect(resetPasswordPath("a/b c")).toBe("/reset-password/a%2Fb%20c");
});
