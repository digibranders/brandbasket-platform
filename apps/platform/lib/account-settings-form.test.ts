import { describe, expect, it } from "vitest";
import { parseChangePasswordForm, parseDeleteForm, parseExitDetails } from "./account-settings-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseChangePasswordForm", () => {
  const valid = { currentPassword: "old-password-1", newPassword: "a-new-password-2", confirmPassword: "a-new-password-2" };

  it("accepts the current password and a new one typed twice", () => {
    expect(parseChangePasswordForm(form(valid))).toEqual({
      success: true,
      currentPassword: "old-password-1",
      newPassword: "a-new-password-2",
    });
  });

  it("asks for the current password", () => {
    expect(parseChangePasswordForm(form({ ...valid, currentPassword: "" }))).toEqual({
      success: false,
      message: "Enter your current password.",
    });
  });

  it("refuses a short new password", () => {
    const result = parseChangePasswordForm(form({ ...valid, newPassword: "short", confirmPassword: "short" }));
    expect(result.success).toBe(false);
  });

  it("refuses new passwords that differ", () => {
    expect(parseChangePasswordForm(form({ ...valid, confirmPassword: "something-else-9" }))).toEqual({
      success: false,
      message: "Both new passwords must match.",
    });
  });

  it("refuses a new password equal to the current one", () => {
    const result = parseChangePasswordForm(form({ ...valid, newPassword: "old-password-1", confirmPassword: "old-password-1" }));
    expect(result).toEqual({ success: false, message: "Choose a password you haven’t used here before." });
  });
});

describe("parseExitDetails", () => {
  it("takes a reason and trims the comment", () => {
    expect(parseExitDetails(form({ reason: "too_expensive", comment: "  a bit much  " }))).toEqual({
      success: true,
      details: { reason: "too_expensive", comment: "a bit much" },
    });
  });

  it("treats a blank comment as none", () => {
    expect(parseExitDetails(form({ reason: "other", comment: "   " }))).toEqual({
      success: true,
      details: { reason: "other", comment: null },
    });
    expect(parseExitDetails(form({ reason: "other" }))).toEqual({ success: true, details: { reason: "other", comment: null } });
  });

  it("refuses a reason that is not one of ours", () => {
    expect(parseExitDetails(form({ reason: "because" })).success).toBe(false);
    expect(parseExitDetails(form({})).success).toBe(false);
  });

  it("refuses a comment past the limit", () => {
    expect(parseExitDetails(form({ reason: "other", comment: "x".repeat(1001) })).success).toBe(false);
    expect(parseExitDetails(form({ reason: "other", comment: "x".repeat(1000) })).success).toBe(true);
  });
});

describe("parseDeleteForm", () => {
  const valid = { reason: "not_using", comment: "", confirmation: "DELETE", password: "my-password-123" };

  it("needs the reason, the word DELETE and the password", () => {
    expect(parseDeleteForm(form(valid))).toEqual({
      success: true,
      details: { reason: "not_using", comment: null },
      password: "my-password-123",
    });
  });

  it("is strict about the word: capitals, nothing else", () => {
    expect(parseDeleteForm(form({ ...valid, confirmation: "delete" })).success).toBe(false);
    expect(parseDeleteForm(form({ ...valid, confirmation: "DELETE ME" })).success).toBe(false);
    expect(parseDeleteForm(form({ ...valid, confirmation: "  DELETE " })).success).toBe(true);
  });

  it("needs a password", () => {
    expect(parseDeleteForm(form({ ...valid, password: "" }))).toEqual({
      success: false,
      message: "Enter your password to confirm it’s you.",
    });
  });

  it("refuses a missing reason before anything else", () => {
    expect(parseDeleteForm(form({ ...valid, reason: "" })).success).toBe(false);
  });
});
