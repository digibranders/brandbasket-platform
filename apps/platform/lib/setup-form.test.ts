import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "@fynix/auth/password-policy";
import { parseSetupForm } from "./setup-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const valid = { name: " Riley Owner ", password: "correct-horse-battery-9", confirmPassword: "correct-horse-battery-9" };

describe("parseSetupForm", () => {
  it("accepts an existing password without creation or confirmation rules", () => {
    expect(parseSetupForm(form({ name: "Owner", mode: "verify-existing", password: "short" }))).toEqual({
      success: true, data: { name: "Owner", password: "short", mode: "verify-existing" },
    });
  });
  it("carries the tick for the Terms and Privacy Notice, only when it was ticked", () => {
    expect(parseSetupForm(form({ ...valid, agree: "yes" }))).toMatchObject({ success: true, data: { agreed: true } });
    expect(parseSetupForm(form({ ...valid, agree: "no" }))).toEqual({ success: true, data: { name: "Riley Owner", password: "correct-horse-battery-9" } });
    expect(parseSetupForm(form(valid))).toEqual({ success: true, data: { name: "Riley Owner", password: "correct-horse-battery-9" } });
  });
  it("points a mismatch at confirmation", () => {
    expect(parseSetupForm(form({ ...valid, confirmPassword: "different" }))).toMatchObject({ success: false, field: "confirmPassword" });
  });
  it("trims the name and keeps the password as typed", () => {
    expect(parseSetupForm(form(valid))).toEqual({
      success: true,
      data: { name: "Riley Owner", password: "correct-horse-battery-9" },
    });
  });

  it("requires a name", () => {
    expect(parseSetupForm(form({ ...valid, name: "  " }))).toMatchObject({
      success: false,
      message: "Tell us your name.",
    });
  });

  it(`requires at least ${PASSWORD_MIN_LENGTH} characters`, () => {
    const short = "ab1!".padEnd(PASSWORD_MIN_LENGTH - 1, "c");
    expect(parseSetupForm(form({ ...valid, password: short, confirmPassword: short }))).toMatchObject({
      success: false,
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    });
  });

  it("requires a letter, a number and a symbol, and points at the password", () => {
    const noSymbol = "abcdefgh1";
    expect(parseSetupForm(form({ ...valid, password: noSymbol, confirmPassword: noSymbol }))).toEqual({
      success: false,
      message: "Add at least one symbol, such as ! # or @.",
      field: "password",
    });
  });

  it("requires both passwords to match", () => {
    expect(parseSetupForm(form({ ...valid, confirmPassword: "something-else" }))).toMatchObject({
      success: false,
      message: "Both passwords must match.",
    });
  });
});
