import { describe, expect, it } from "vitest";
import { billsInRupees } from "./billing-details-view";

describe("billsInRupees", () => {
  it("follows the plan's currency when there is a plan", () => {
    expect(billsInRupees("INR", null)).toBe(true);
    expect(billsInRupees("USD", "INR")).toBe(false);
  });

  it("falls back on the business's own currency for a listing account with no plan", () => {
    expect(billsInRupees(null, "INR")).toBe(true);
    expect(billsInRupees(null, "USD")).toBe(false);
  });

  it("is no when neither currency is known", () => {
    expect(billsInRupees(null, null)).toBe(false);
  });
});
