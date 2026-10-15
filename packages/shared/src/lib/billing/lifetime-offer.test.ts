import { describe, expect, it } from "vitest";
import {
  LIFETIME_OFFER_PERCENT,
  LIFETIME_OFFER_TEXT,
  lifetimeOfferApplies,
  lifetimeOfferCentsFor,
  lifetimeOfferVisible,
} from "./lifetime-offer";

describe("lifetime offer", () => {
  it("keeps the owner's wording", () => {
    expect(LIFETIME_OFFER_TEXT).toBe(
      "Add any package and get an additional 5% lifetime discount! This is a one-time offer available only during this checkout.",
    );
    expect(LIFETIME_OFFER_PERCENT).toBe(5);
  });

  it("takes 5% of a net price, rounded half up, in whole paise", () => {
    expect(lifetimeOfferCentsFor(200_000)).toBe(10_000);
    expect(lifetimeOfferCentsFor(400_000)).toBe(20_000);
    expect(lifetimeOfferCentsFor(199_900)).toBe(9_995);
    expect(lifetimeOfferCentsFor(10)).toBe(1);
    expect(() => lifetimeOfferCentsFor(-1)).toThrow(RangeError);
  });

  it("is shown only until the first plan payment", () => {
    expect(lifetimeOfferVisible({ hasEverPaid: false })).toBe(true);
    expect(lifetimeOfferVisible({ hasEverPaid: true })).toBe(false);
  });

  it("prices an add-on with the offer only if it is bought at the first checkout, or was before", () => {
    expect(lifetimeOfferApplies({ hasEverPaid: false, claimedBefore: false })).toBe(true);
    expect(lifetimeOfferApplies({ hasEverPaid: true, claimedBefore: true })).toBe(true);
    // Missed at the first checkout: this add-on is at its full price from then on.
    expect(lifetimeOfferApplies({ hasEverPaid: true, claimedBefore: false })).toBe(false);
  });
});
