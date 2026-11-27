import { describe, expect, it } from "vitest";
import { buildRows, feeRenewalTerms, monthlyFeeDeal } from "./build-fee";

const fee = (discountCents: number) => ({ listCents: 3_500_000, discountCents, netCents: 3_500_000 - discountCents });

describe("buildRows", () => {
  it("shows the fee at its list price for the kind of website", () => {
    expect(buildRows({ kind: "b2b", fee: fee(0), note: null }, "INR")).toEqual([{ key: "build", label: "B2B website build", amount: "₹35,000", tone: "plain" }]);
    expect(buildRows({ kind: "ecommerce", fee: { listCents: 6_500_000, discountCents: 0, netCents: 6_500_000 }, note: null }, "INR")[0]).toMatchObject({ label: "Ecommerce store build", amount: "₹65,000" });
  });
  it("adds the deal's discount under it, with the staff note, or a plain label without one", () => {
    expect(buildRows({ kind: "b2b", fee: fee(1_000_000), note: "As agreed on call" }, "INR")[1]).toEqual({ key: "build-discount", label: "As agreed on call", amount: "-₹10,000", tone: "save" });
    expect(buildRows({ kind: "b2b", fee: fee(1_000_000), note: null }, "INR")[1]?.label).toBe("Build discount");
  });
});

describe("monthlyFeeDeal", () => {
  it("is a monthly deal that pays something for the build", () => {
    expect(monthlyFeeDeal({ kind: "b2b", fee: fee(0), note: null }, "month")).toBe(true);
    expect(monthlyFeeDeal({ kind: "b2b", fee: fee(0), note: null }, "year")).toBe(false);
    expect(monthlyFeeDeal({ kind: "b2b", fee: fee(3_500_000), note: null }, "month")).toBe(false);
    expect(monthlyFeeDeal({ kind: "b2b", fee: null, note: null }, "month")).toBe(false);
    expect(monthlyFeeDeal(null, "month")).toBe(false);
  });
});

describe("feeRenewalTerms", () => {
  const base = { currency: "INR", taxed: true, services: 2, codeMonths: null, cycleWithoutCodeCents: 599_800 } as const;
  it("says the website's month starts a month on, monthly", () => {
    expect(feeRenewalTerms({ ...base, interval: "month", cycleCents: 599_800 })).toBe(
      "Your payment covers the build. From one month after you pay, ₹5,998 (GST included) is taken each month for your services.",
    );
  });
  it("counts a code's months from the first monthly charge", () => {
    expect(feeRenewalTerms({ ...base, interval: "month", cycleCents: 549_800, codeMonths: 3 })).toBe(
      "Your payment covers the build. From one month after you pay, ₹5,498 (GST included) is taken each month for 3 months, then ₹5,998 a month.",
    );
  });
  it("renews a yearly deal 13 months on", () => {
    expect(feeRenewalTerms({ ...base, interval: "year", cycleCents: 6_477_800, services: 1 })).toBe(
      "Your payment covers the build and 12 months of your service. They renew each year, starting 13 months after you pay, at ₹64,778 (GST included).",
    );
  });
});
