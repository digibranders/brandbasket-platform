import { describe, expect, it } from "vitest";
import { paymentDescription, planLabel, receiptDescription, receiptNumber, receiptTitle } from "./receipt-title";

describe("receiptNumber", () => {
  it("pads to three digits", () => {
    expect(receiptNumber(7)).toBe("#007");
    expect(receiptNumber(42)).toBe("#042");
  });

  it("keeps longer numbers whole", () => {
    expect(receiptNumber(1234)).toBe("#1234");
  });

  it("refuses anything that is not a positive whole number", () => {
    expect(() => receiptNumber(0)).toThrow(RangeError);
    expect(() => receiptNumber(-1)).toThrow(RangeError);
    expect(() => receiptNumber(1.5)).toThrow(RangeError);
  });
});

describe("receiptTitle", () => {
  it("names the receipt by its number and the month it was paid, in UTC", () => {
    expect(receiptTitle(7, new Date("2026-09-12T10:00:00Z"))).toBe("Receipt #007 – Sep 2026");
    expect(receiptTitle(3, new Date("2026-12-31T23:30:00Z"))).toBe("Receipt #003 – Dec 2026");
  });

  it("leaves the month off when the payment date was not recorded", () => {
    expect(receiptTitle(2, null)).toBe("Receipt #002");
  });
});

describe("paymentDescription", () => {
  it("says what each kind of payment bought", () => {
    expect(paymentDescription("initial", 1)).toBe("First payment, covering your first month");
    expect(paymentDescription("initial", 3)).toBe("First payment, covering your first 3 months");
    expect(paymentDescription("initial", null)).toBe("First payment");
    expect(paymentDescription("renewal", 1)).toBe("Monthly payment");
    expect(paymentDescription("reactivation", null)).toBe("Restarting your plan");
    expect(paymentDescription("extra_publish", null)).toBe("Extra publish");
    expect(paymentDescription("charge", null)).toBe("Paid extra");
    expect(paymentDescription("add_on", null)).toBe("Add-on");
  });
});

describe("planLabel", () => {
  it("adds \"plan\" to a bare name, and leaves a name that already has it", () => {
    expect(planLabel("Care")).toBe("Care plan");
    expect(planLabel("Fynix care plan")).toBe("Fynix care plan");
    expect(planLabel("Care Plan ")).toBe("Care Plan");
    expect(planLabel("Explanation")).toBe("Explanation plan");
  });
});

describe("receiptDescription", () => {
  const plain = { initialTermMonths: null, chargeKind: null, chargeDescription: null, chargeQuantity: null, addOnId: null } as const;

  it("names an add-on payment by the add-on and how it is billed", () => {
    expect(receiptDescription({ ...plain, kind: "add_on", addOnId: "local-seo" })).toBe("Local SEO, monthly");
    expect(receiptDescription({ ...plain, kind: "add_on", addOnId: "performance-marketing" })).toBe("Performance marketing, monthly");
  });

  it("keeps the general wording for an add-on payment it cannot name", () => {
    expect(receiptDescription({ ...plain, kind: "add_on" })).toBe("Add-on");
    expect(receiptDescription({ ...plain, kind: "add_on", addOnId: "fax-machine" })).toBe("Add-on");
  });

  it("does not treat the add-on of a one-time press release as monthly", () => {
    expect(receiptDescription({ ...plain, kind: "add_on", addOnId: "press-release" })).toBe("Add-on");
  });

  it("describes a plan payment by its kind", () => {
    expect(receiptDescription({ ...plain, kind: "renewal" })).toBe("Monthly payment");
  });
});
