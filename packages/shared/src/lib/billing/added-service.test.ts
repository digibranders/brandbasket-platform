import { describe, expect, it } from "vitest";
import { planAddedService, type AddedServiceInput } from "./added-service";

const PRICE = 299_900;
const NOV_1 = new Date("2026-11-01T06:00:00.000Z");
const DEC_1 = new Date("2026-12-01T06:00:00.000Z");

function input(extra: Partial<AddedServiceInput> = {}): AddedServiceInput {
  return {
    service: "social-media",
    netCents: PRICE,
    hadService: false,
    interval: "month",
    provider: "razorpay",
    currency: "INR",
    now: new Date("2026-11-11T06:00:00.000Z"),
    period: { start: NOV_1, end: DEC_1 },
    currentRenewalCents: PRICE,
    ...extra,
  };
}

describe("planAddedService", () => {
  it("moves the billing date to a month after Social is bought, and charges ₹1 plus the Website for the days in between (the owner's example)", () => {
    const plan = planAddedService(input());
    expect(plan).toEqual({
      kind: "plan",
      offer: true,
      newBillingDate: new Date("2026-12-11T06:00:00.000Z"),
      serviceCents: 100,
      // Ten days of the ₹2,999 renewal, out of December's 31: ₹967.42.
      extensionCents: 96_742,
      extensionDays: 10,
      upfrontCents: 96_842,
      trialPriceCents: 100,
    });
  });

  it("charges the extension at what the renewal takes now, so a code's discount is kept", () => {
    const plan = planAddedService(input({ currentRenewalCents: PRICE - 50_000 }));
    expect(plan).toMatchObject({ extensionCents: Math.round(((PRICE - 50_000) * 10) / 31) });
  });

  it("keeps the billing date for a service that is not on the offer, and charges its share of the month left", () => {
    const plan = planAddedService(input({ service: "managed-website" }));
    expect(plan).toMatchObject({ kind: "plan", offer: false, newBillingDate: DEC_1, extensionCents: 0, trialPriceCents: null });
    // Twenty of November's thirty days.
    expect(plan.kind === "plan" && plan.upfrontCents).toBe(Math.round((PRICE * 20) / 30));
  });

  it("gives no offer for a service the business had before, a yearly plan or bank transfer", () => {
    expect(planAddedService(input({ hadService: true }))).toMatchObject({ offer: false, newBillingDate: DEC_1 });
    expect(planAddedService(input({ interval: "year" }))).toMatchObject({ offer: false });
    expect(planAddedService(input({ provider: "manual" }))).toMatchObject({ offer: false });
  });

  it("takes no extension when the offer ends on the billing date itself", () => {
    const plan = planAddedService(input({ now: NOV_1 }));
    expect(plan).toMatchObject({ newBillingDate: DEC_1, extensionCents: 0, extensionDays: 0, upfrontCents: 100 });
  });

  it("refuses within the last hour of the paid month, as an add always has", () => {
    expect(planAddedService(input({ now: new Date(DEC_1.getTime() - 30 * 60_000) }))).toEqual({ kind: "refused", reason: "renewal-due" });
  });

  it("takes $1 for the offer in dollars", () => {
    expect(planAddedService(input({ currency: "USD", currentRenewalCents: 5_900 }))).toMatchObject({ serviceCents: 100, extensionCents: Math.round((5_900 * 10) / 31) });
  });
});
