import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "../src";
import { STAFF_PASSWORD_MIN_LENGTH, validateNewPassword } from "./password-rules";

const VALID_PASSWORD = "a".repeat(PASSWORD_MIN_LENGTH);

describe("validateNewPassword", () => {
  it("accepts a password that meets the minimum length and matches its confirmation", () => {
    expect(validateNewPassword(VALID_PASSWORD, VALID_PASSWORD)).toBeNull();
  });

  it("rejects a password shorter than the minimum length", () => {
    const tooShort = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validateNewPassword(tooShort, tooShort)).toBe(
      `The password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  });

  it("rejects a password containing a control character, such as an arrow key's escape byte", () => {
    const withEscapeByte = `${VALID_PASSWORD}\x1b[A`;
    expect(validateNewPassword(withEscapeByte, withEscapeByte)).toBe(
      "The password contains control characters (for example arrow keys). Type it again.",
    );
  });

  it("rejects a password containing the DEL byte", () => {
    const withDel = `${VALID_PASSWORD}\x7f`;
    expect(validateNewPassword(withDel, withDel)).toBe(
      "The password contains control characters (for example arrow keys). Type it again.",
    );
  });

  it("rejects when the confirmation does not match", () => {
    expect(validateNewPassword(VALID_PASSWORD, `${VALID_PASSWORD}x`)).toBe("The passwords don't match.");
  });

  it("reports the length problem before checking the mismatch", () => {
    const tooShort = "short";
    expect(validateNewPassword(tooShort, "different-and-also-short")).toBe(
      `The password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  });
});

describe("validateNewPassword for staff", () => {
  it("asks staff for 14 characters, and says so", () => {
    expect(STAFF_PASSWORD_MIN_LENGTH).toBe(14);
    const thirteen = "a".repeat(13);
    expect(validateNewPassword(thirteen, thirteen, STAFF_PASSWORD_MIN_LENGTH)).toBe("The password must be at least 14 characters.");
    const fourteen = "a".repeat(14);
    expect(validateNewPassword(fourteen, fourteen, STAFF_PASSWORD_MIN_LENGTH)).toBeNull();
  });

  it("still asks customers for the shorter minimum", () => {
    const ten = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validateNewPassword(ten, ten)).toBeNull();
  });
});
