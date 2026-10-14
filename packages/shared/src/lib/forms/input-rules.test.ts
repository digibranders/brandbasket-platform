import { describe, expect, it } from "vitest";
import { applyInputRule, caretAfterRule, FIELD_PATTERNS, phoneDigitsMessage } from "./input-rules";

describe("applyInputRule", () => {
  it("keeps only digits for digits", () => {
    expect(applyInputRule("digits", "12a3 4-5")).toBe("12345");
    expect(applyInputRule("digits", "abc")).toBe("");
  });

  it("keeps digits and the characters people group a phone number with", () => {
    expect(applyInputRule("phone", "98765 43210")).toBe("98765 43210");
    expect(applyInputRule("phone", "+44 (20) 7946-0958")).toBe("+44 (20) 7946-0958");
    expect(applyInputRule("phone", "98abc765xyz")).toBe("98765");
  });

  it("allows a plus only as the first character of a phone number", () => {
    expect(applyInputRule("phone", "98+765")).toBe("98765");
    expect(applyInputRule("phone", "++91 98")).toBe("+91 98");
  });

  it("keeps one decimal point and at most two places for an amount", () => {
    expect(applyInputRule("amount", "1,499.50")).toBe("1499.50");
    expect(applyInputRule("amount", "12.3.4")).toBe("12.34");
    expect(applyInputRule("amount", "9.999")).toBe("9.99");
    expect(applyInputRule("amount", "Rs 200")).toBe("200");
  });

  it("keeps letters in any script, spaces and name punctuation for a person's name", () => {
    expect(applyInputRule("personName", "Dr. Anil D'Souza-Rao")).toBe("Dr. Anil D'Souza-Rao");
    expect(applyInputRule("personName", "प्रिया शर्मा")).toBe("प्रिया शर्मा");
    expect(applyInputRule("personName", "Priya123!")).toBe("Priya");
  });

  it("upper-cases a code and drops anything but letters and digits", () => {
    expect(applyInputRule("code", "27aapfu 0939f1zv")).toBe("27AAPFU0939F1ZV");
    expect(applyInputRule("code", "ab-12_c")).toBe("AB12C");
  });
});

describe("caretAfterRule", () => {
  it("moves the caret back by the characters removed before it", () => {
    // "98a7|65" -> "987|65": one character before the caret was dropped.
    expect(caretAfterRule("phone", "98a765", 4)).toBe(3);
  });

  it("leaves the caret where it was when nothing before it changed", () => {
    expect(caretAfterRule("digits", "123x", 2)).toBe(2);
  });
});

describe("FIELD_PATTERNS", () => {
  const matches = (pattern: string, value: string): boolean => new RegExp(`^(?:${pattern})$`, "v").test(value);

  it("accepts a real GSTIN and refuses a near miss", () => {
    expect(matches(FIELD_PATTERNS.gstin, "27AAPFU0939F1ZV")).toBe(true);
    expect(matches(FIELD_PATTERNS.gstin, "27AAPFU0939F1YV")).toBe(false);
  });

  it("accepts an Indian PIN code that does not start with zero", () => {
    expect(matches(FIELD_PATTERNS.pincode, "560001")).toBe(true);
    expect(matches(FIELD_PATTERNS.pincode, "060001")).toBe(false);
    expect(matches(FIELD_PATTERNS.pincode, "56000")).toBe(false);
  });

  it("accepts a six-digit code", () => {
    expect(matches(FIELD_PATTERNS.otp, "042917")).toBe(true);
    expect(matches(FIELD_PATTERNS.otp, "42917")).toBe(false);
  });

  it("accepts an amount with up to two places", () => {
    expect(matches(FIELD_PATTERNS.amount, "1499")).toBe(true);
    expect(matches(FIELD_PATTERNS.amount, "1499.5")).toBe(true);
    expect(matches(FIELD_PATTERNS.amount, ".5")).toBe(false);
    // The server's money parser reads a leading zero, so the browser must not refuse one.
    expect(matches(FIELD_PATTERNS.amount, "05")).toBe(true);
  });

  it("accepts a four-digit year from 1800 to 2099", () => {
    expect(matches(FIELD_PATTERNS.year, "2004")).toBe(true);
    expect(matches(FIELD_PATTERNS.year, "1799")).toBe(false);
  });

});

describe("phoneDigitsMessage", () => {
  const india = { min: 8, max: 13 };

  it("is null for a blank field, which `required` reports instead", () => {
    expect(phoneDigitsMessage("", india)).toBeNull();
  });

  it("is null when the digit count fits the country", () => {
    expect(phoneDigitsMessage("98765 43210", india)).toBeNull();
  });

  it("allows one extra digit for a leading trunk zero", () => {
    expect(phoneDigitsMessage("098765 43210", { min: 10, max: 10 })).toBeNull();
  });

  it("says how many digits are expected when too short or too long", () => {
    expect(phoneDigitsMessage("12345", india)).toBe("Enter 8 to 13 digits.");
    expect(phoneDigitsMessage("12345", { min: 10, max: 10 })).toBe("Enter 10 digits.");
  });

  it("checks an international number against E.164's limits instead of the country", () => {
    expect(phoneDigitsMessage("+44 20 7946 0958", { min: 10, max: 10 })).toBeNull();
    expect(phoneDigitsMessage("+44 12", { min: 10, max: 10 })).toBe("Enter the full number after the country code.");
  });
});
