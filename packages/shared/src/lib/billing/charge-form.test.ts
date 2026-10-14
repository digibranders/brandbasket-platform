import { describe, expect, it } from "vitest";
import { parseChargeForm } from "./charge-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("parseChargeForm", () => {
  it("reads a priced kind, ignoring any price posted with it", () => {
    expect(parseChargeForm(form({ kind: "change_hours", quantity: "2", description: "", price: "1" }))).toEqual({
      ok: true,
      request: { kind: "change_hours", quantity: 2, description: null, customUnitAmountCents: null },
    });
  });

  it("keeps staff's own wording, tidied", () => {
    const parsed = parseChargeForm(form({ kind: "extra_publish", quantity: "1", description: "  Launch   page  " }));
    expect(parsed).toMatchObject({ ok: true, request: { description: "Launch page" } });
  });

  it("reads a custom charge with its own price", () => {
    expect(parseChargeForm(form({ kind: "custom", quantity: "1", description: "Logo refresh", price: "2,500" }))).toEqual({
      ok: true,
      request: { kind: "custom", quantity: 1, description: "Logo refresh", customUnitAmountCents: 250_000 },
    });
  });

  it("refuses what it cannot charge for", () => {
    expect(parseChargeForm(form({ kind: "appointments", quantity: "1" }))).toEqual({ ok: false, problem: "invalid-kind" });
    // A week of a listing tag is only ever opened by the customer, at its fixed price.
    expect(parseChargeForm(form({ kind: "listing_promotion", quantity: "1" }))).toEqual({ ok: false, problem: "invalid-kind" });
    expect(parseChargeForm(form({ kind: "change_hours", quantity: "0" }))).toEqual({ ok: false, problem: "invalid-quantity" });
    expect(parseChargeForm(form({ kind: "change_hours", quantity: "1.5" }))).toEqual({ ok: false, problem: "invalid-quantity" });
    expect(parseChargeForm(form({ kind: "change_hours", quantity: "101" }))).toEqual({ ok: false, problem: "invalid-quantity" });
    expect(parseChargeForm(form({ kind: "custom", quantity: "1", description: "", price: "10" }))).toEqual({
      ok: false,
      problem: "missing-description",
    });
    expect(parseChargeForm(form({ kind: "custom", quantity: "1", description: "Logo", price: "0" }))).toEqual({
      ok: false,
      problem: "invalid-price",
    });
    expect(parseChargeForm(form({ kind: "custom", quantity: "1", description: "Logo", price: "ten" }))).toEqual({
      ok: false,
      problem: "invalid-price",
    });
  });
});
