import { describe, expect, it } from "vitest";
import { parseSetupForm, SETUP_PASSWORD_MIN_LENGTH } from "./setup-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const valid = { name: " Riley Owner ", password: "correct-horse-battery", confirmPassword: "correct-horse-battery" };

describe("parseSetupForm", () => {
  it("accepts an existing password without creation or confirmation rules", () => {
    expect(parseSetupForm(form({ name: "Owner", mode: "verify-existing", password: "short" }))).toEqual({
      success: true, data: { name: "Owner", password: "short", mode: "verify-existing" },
    });
  });
  it("carries the tick for the Terms and Privacy Notice, only when it was ticked", () => {
    expect(parseSetupForm(form({ ...valid, agree: "yes" }))).toMatchObject({ success: true, data: { agreed: true } });
    expect(parseSetupForm(form({ ...valid, agree: "no" }))).toEqual({ success: true, data: { name: "Riley Owner", password: "correct-horse-battery" } });
    expect(parseSetupForm(form(valid))).toEqual({ success: true, data: { name: "Riley Owner", password: "correct-horse-battery" } });
  });
  it("points a mismatch at confirmation", () => {
    expect(parseSetupForm(form({ ...valid, confirmPassword: "different" }))).toMatchObject({ success: false, field: "confirmPassword" });
  });
  it("trims the name and keeps the password as typed", () => {
    expect(parseSetupForm(form(valid))).toEqual({
      success: true,
      data: { name: "Riley Owner", password: "correct-horse-battery" },
    });
  });

  it("requires a name", () => {
    expect(parseSetupForm(form({ ...valid, name: "  " }))).toMatchObject({
      success: false,
      message: "Tell us your name.",
    });
  });

  it(`requires at least ${SETUP_PASSWORD_MIN_LENGTH} characters`, () => {
    const short = "a".repeat(SETUP_PASSWORD_MIN_LENGTH - 1);
    expect(parseSetupForm(form({ ...valid, password: short, confirmPassword: short }))).toMatchObject({
      success: false,
      message: `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters.`,
    });
  });

  it("requires both passwords to match", () => {
    expect(parseSetupForm(form({ ...valid, confirmPassword: "something-else" }))).toMatchObject({
      success: false,
      message: "Both passwords must match.",
    });
  });
});
