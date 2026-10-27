import { describe, expect, it } from "vitest";
import { parseRefundForm, readRefundNotice, refundNoticeHref } from "./refund-form";

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";
const PAYMENT = "01920000-0000-7000-8000-0000000000a1";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const GOOD = { businessId: BUSINESS, paymentId: PAYMENT, amount: "2,999.00", reason: "  Charged twice  ", confirm: "yes" };

describe("parseRefundForm", () => {
  it("reads the amount as paise and trims the reason", () => {
    expect(parseRefundForm(form(GOOD))).toEqual({
      ok: true,
      value: { businessId: BUSINESS, paymentId: PAYMENT, refundedAmountCents: 299_900, reason: "Charged twice" },
    });
  });

  it("says what is wrong with each field", () => {
    expect(parseRefundForm(form({ ...GOOD, paymentId: "x" }))).toEqual({ ok: false, businessId: BUSINESS, notice: "not-refundable" });
    expect(parseRefundForm(form({ ...GOOD, amount: "0" }))).toEqual({ ok: false, businessId: BUSINESS, notice: "invalid-amount" });
    expect(parseRefundForm(form({ ...GOOD, amount: "12.345" }))).toEqual({ ok: false, businessId: BUSINESS, notice: "invalid-amount" });
    expect(parseRefundForm(form({ ...GOOD, reason: "no" }))).toEqual({ ok: false, businessId: BUSINESS, notice: "invalid-reason" });
    expect(parseRefundForm(form({ ...GOOD, reason: "x".repeat(301) }))).toEqual({ ok: false, businessId: BUSINESS, notice: "invalid-reason" });
    expect(parseRefundForm(form({ ...GOOD, confirm: "" }))).toEqual({ ok: false, businessId: BUSINESS, notice: "unconfirmed" });
  });

  it("refuses a form with no business at all", () => {
    expect(() => parseRefundForm(form({ ...GOOD, businessId: "" }))).toThrow("The refund form has no business");
  });
});

describe("notices", () => {
  it("links back to the client's payments with the notice, and reads only known notices", () => {
    expect(refundNoticeHref(BUSINESS, "marked")).toBe(`/clients/${BUSINESS}/billing?refund=marked#payments`);
    expect(readRefundNotice("amount-too-high")).toBe("amount-too-high");
    expect(readRefundNotice("anything")).toBeNull();
    expect(readRefundNotice(undefined)).toBeNull();
  });
});
