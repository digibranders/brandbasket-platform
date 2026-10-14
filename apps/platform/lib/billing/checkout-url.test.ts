import { describe, expect, it } from "vitest";
import { isSafeCheckoutUrl } from "./checkout-url";

describe("isSafeCheckoutUrl", () => {
  it.each(["/billing/confirm?token=abc", "https://checkout.razorpay.com/v1/abc"])("follows %s", (url) => {
    expect(isSafeCheckoutUrl(url)).toBe(true);
  });

  it.each([
    "//evil.example/pay",
    "/\\evil.example",
    "http://checkout.example/pay",
    "javascript:alert(1)",
    "billing/confirm",
    "",
  ])("refuses %s", (url) => {
    expect(isSafeCheckoutUrl(url)).toBe(false);
  });
});
