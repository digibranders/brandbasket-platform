import { describe, expect, it } from "vitest";
import { formPriceValue, parsePricingForm } from "./pricing-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const INR = { currency: "INR", tier: "managed", extraHour: "1425", extraPublish: "300", extraBlogPosts: "475" };

describe("parsePricingForm", () => {
  it("reads every price in minor units", () => {
    expect(parsePricingForm(form(INR))).toEqual({
      ok: true,
      sheet: { currency: "INR", tier: "managed", extraHourCents: 142_500, extraPublishCents: 30_000, extraBlogPostsCents: 47_500 },
    });
  });

  it("reads which plan the prices are for, and nothing else", () => {
    expect(parsePricingForm(form({ ...INR, tier: "managed" }))).toMatchObject({ ok: true, sheet: { tier: "managed" } });
    expect(parsePricingForm(form({ ...INR, tier: "gold" }))).toEqual({ ok: false, problem: "invalid-tier" });
    expect(parsePricingForm(form({ ...INR, tier: "" }))).toEqual({ ok: false, problem: "invalid-tier" });
  });

  it("keeps cents", () => {
    expect(parsePricingForm(form({ ...INR, currency: "USD", extraHour: "69.50" }))).toMatchObject({
      ok: true,
      sheet: { currency: "USD", extraHourCents: 6_950 },
    });
  });

  it("ignores a monthly price: the services are priced in code, not by plan rows", () => {
    expect(parsePricingForm(form({ ...INR, monthly: "2,999" }))).toEqual(parsePricingForm(form(INR)));
  });

  it("names the first price it cannot use", () => {
    expect(parsePricingForm(form({ ...INR, currency: "EUR" }))).toEqual({ ok: false, problem: "invalid-currency" });
    expect(parsePricingForm(form({ ...INR, extraHour: "abc" }))).toEqual({ ok: false, problem: "invalid-extra-hour" });
    expect(parsePricingForm(form({ ...INR, extraPublish: "1.234" }))).toEqual({ ok: false, problem: "invalid-extra-publish" });
    expect(parsePricingForm(form({ ...INR, extraBlogPosts: "100000000" }))).toEqual({
      ok: false,
      problem: "invalid-extra-blog-posts",
    });
  });
});

describe("formPriceValue", () => {
  it("shows whole amounts plainly and keeps cents", () => {
    expect(formPriceValue(299_900)).toBe("2999");
    expect(formPriceValue(6_950)).toBe("69.50");
  });

  it("round-trips through the parser", () => {
    const parsed = parsePricingForm(form({ ...INR, extraHour: formPriceValue(412_345) }));
    expect(parsed).toMatchObject({ ok: true, sheet: { extraHourCents: 412_345 } });
  });
});
