import { describe, expect, it } from "vitest";
import {
  carePlan,
  changePricing,
  currencyForCountry,
  formatPrice,
  planPrice,
  planPriceInBoth,
  planPrices,
} from "./pricing";

describe("formatPrice", () => {
  it("omits cents for whole dollar amounts", () => {
    expect(formatPrice(7_500)).toBe("$75");
    expect(formatPrice(22_500)).toBe("$225");
  });

  it("shows cents when present and groups thousands", () => {
    expect(formatPrice(1_234_567)).toBe("$12,345.67");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0");
  });

  it("rejects negative, fractional and non-numeric amounts", () => {
    expect(() => formatPrice(-1)).toThrow(RangeError);
    expect(() => formatPrice(10.5)).toThrow(RangeError);
    expect(() => formatPrice(Number.NaN)).toThrow(RangeError);
  });
});

describe("carePlan", () => {
  it("prices the plan monthly from the first payment", () => {
    expect(formatPrice(carePlan.monthlyCents)).toBe("$69");
    expect(carePlan).not.toHaveProperty("firstTermCents");
  });
});

describe("changePricing", () => {
  it("includes the first hour of changes once, then charges $15 an hour", () => {
    expect(changePricing.includedHours).toBe(1);
    expect(formatPrice(changePricing.extraHourCents)).toBe("$15");
  });

  it("includes 100 blog posts, then sells them in blocks of 100 for $5", () => {
    expect(changePricing.includedBlogPosts).toBe(100);
    expect(changePricing.blogPostBlockSize).toBe(100);
    expect(formatPrice(changePricing.extraBlogPostsCents)).toBe("$5");
  });
});

describe("planPrices", () => {
  it("prices the plan in dollars from the same numbers as the rest of the page", () => {
    expect(planPrices.USD).toEqual({
      monthly: carePlan.monthlyCents,
      extraHour: changePricing.extraHourCents,
      extraBlogPosts: changePricing.extraBlogPostsCents,
    });
  });

  it("formats each price in its own currency", () => {
    expect(planPrice("monthly", "USD")).toBe("$69");
    expect(planPrice("monthly", "INR")).toBe("₹9,999");
    expect(planPrice("extraHour", "USD")).toBe("$15");
    expect(planPrice("extraHour", "INR")).toBe("₹1,425");
    expect(planPrice("extraBlogPosts", "USD")).toBe("$5");
    expect(planPrice("extraBlogPosts", "INR")).toBe("₹475");
  });

  it("names both prices for text that can't switch currency", () => {
    expect(planPriceInBoth("monthly")).toBe("$69 (₹9,999 in India)");
    expect(planPriceInBoth("extraHour")).toBe("$15 (₹1,425 in India)");
  });
});

describe("currencyForCountry", () => {
  it("shows rupees in India and dollars everywhere else", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("in")).toBe("INR");
    expect(currencyForCountry("GB")).toBe("USD");
    expect(currencyForCountry(null)).toBe("USD");
  });
});
