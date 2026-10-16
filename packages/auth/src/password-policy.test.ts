import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE, passwordPolicyProblem } from "./password-policy";

describe("passwordPolicyProblem", () => {
  it("accepts 8 characters with a letter, a number and a symbol", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(passwordPolicyProblem("abcdef1!")).toBeNull();
    expect(passwordPolicyProblem("Correct-Horse-9")).toBeNull();
  });

  it("refuses anything shorter than the minimum", () => {
    expect(passwordPolicyProblem("abcde1!")).toBe("Use at least 8 characters.");
    expect(passwordPolicyProblem("")).toBe("Use at least 8 characters.");
  });

  it("refuses anything longer than the maximum", () => {
    expect(passwordPolicyProblem(`a1!${"x".repeat(PASSWORD_MAX_LENGTH)}`)).toBe("That password is too long.");
    expect(passwordPolicyProblem(`a1!${"x".repeat(PASSWORD_MAX_LENGTH - 3)}`)).toBeNull();
  });

  it("names the first missing kind of character", () => {
    expect(passwordPolicyProblem("12345678!")).toBe("Add at least one letter.");
    expect(passwordPolicyProblem("abcdefgh!")).toBe("Add at least one number.");
    expect(passwordPolicyProblem("abcdefgh1")).toBe("Add at least one symbol, such as ! # or @.");
  });

  it("counts letters from any alphabet, and does not count a space as a symbol", () => {
    expect(passwordPolicyProblem("पासवर्ड12!")).toBeNull();
    expect(passwordPolicyProblem("abcd efg1")).toBe("Add at least one symbol, such as ! # or @.");
  });

  it("describes the rule with the same numbers it enforces", () => {
    expect(PASSWORD_RULE).toBe("At least 8 characters, with a letter, a number and a symbol.");
  });
});
