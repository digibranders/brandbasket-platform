import { describe, expect, it, vi } from "vitest";
import { billingCurrencyForPhone } from "./currency-for-phone";

vi.mock("server-only", () => ({}));

describe("billingCurrencyForPhone", () => {
  it.each(["+919876543210", "+91 98765 43210", "+91-80-4000-1234"])("bills an Indian number (%s) in INR", (phone) => {
    expect(billingCurrencyForPhone(phone)).toBe("INR");
  });

  it.each(["+14155550123", "+447911123456", "+61412345678", "+971501234567"])(
    "bills every other country (%s) in USD",
    (phone) => {
      expect(billingCurrencyForPhone(phone)).toBe("USD");
    },
  );

  /**
   * Older leads kept whatever was typed. Without a country code there is no telling where a number is from, so it
   * falls back to the long-standing default rather than guessing — staff can still switch it before the setup link.
   */
  it.each(["98765 43210", "call me", ""])("falls back to USD for a number it cannot place (%j)", (phone) => {
    expect(billingCurrencyForPhone(phone)).toBe("USD");
  });

  it("falls back to USD for a lead that gave no number at all", () => {
    expect(billingCurrencyForPhone(null)).toBe("USD");
  });
});
