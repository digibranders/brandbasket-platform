import { describe, expect, it, vi } from "vitest";
import { disallowedPhoneMessage, isPhoneCountryAllowed } from "./sms-country-guard";

vi.mock("server-only", () => ({}));

describe("isPhoneCountryAllowed", () => {
  it("allows a number matching the default India-only list", () => {
    expect(isPhoneCountryAllowed("+919876543210", ["91"])).toBe(true);
  });

  it("refuses a number outside the allowed list", () => {
    expect(isPhoneCountryAllowed("+14155551234", ["91"])).toBe(false);
  });

  it("allows a number matching any code in a widened list", () => {
    expect(isPhoneCountryAllowed("+14155551234", ["91", "1"])).toBe(true);
  });

  it("does not falsely match a code that is only a prefix of another (91 vs 9)", () => {
    // A "+9..." number from some other country must not be treated as India (+91) just because "9" is a prefix.
    expect(isPhoneCountryAllowed("+95123456789", ["91"])).toBe(false);
  });
});

describe("disallowedPhoneMessage", () => {
  it("says Indian mobile numbers for the default single-code list", () => {
    expect(disallowedPhoneMessage(["91"])).toBe("We can only text Indian mobile numbers right now.");
  });

  it("lists the codes for a widened list", () => {
    expect(disallowedPhoneMessage(["91", "1", "44"])).toBe("We can only text numbers in +91, +1, +44 right now.");
  });

  it("lists a single non-India code by its own wording, not the India shortcut", () => {
    expect(disallowedPhoneMessage(["1"])).toBe("We can only text numbers in +1 right now.");
  });
});
