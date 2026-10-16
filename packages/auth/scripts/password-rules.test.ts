import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "../src/password-policy";
import { validateNewPassword } from "./password-rules";

const VALID_PASSWORD = "staff-pass-1";

describe("validateNewPassword", () => {
  it("accepts a password that meets the rule and matches its confirmation", () => {
    expect(validateNewPassword(VALID_PASSWORD, VALID_PASSWORD)).toBeNull();
  });

  it("holds staff to the same rule as customers: 8 characters with a letter, a number and a symbol", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validateNewPassword("abcdef1!", "abcdef1!")).toBeNull();
    expect(validateNewPassword("abcde1!", "abcde1!")).toBe("Use at least 8 characters.");
    expect(validateNewPassword("abcdefgh1", "abcdefgh1")).toBe("Add at least one symbol, such as ! # or @.");
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

  it("reports the rule problem before checking the mismatch", () => {
    expect(validateNewPassword("short", "different-and-also-short")).toBe("Use at least 8 characters.");
  });
});
