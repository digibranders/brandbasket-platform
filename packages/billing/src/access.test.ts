import type { SubscriptionStatus } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { hasBillingAccess } from "./access";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const FUTURE = new Date("2026-10-16T12:00:00.000Z");
const PAST = new Date("2026-08-16T12:00:00.000Z");
const ONE_MS_LATER = new Date(NOW.getTime() + 1);

function subscription(status: SubscriptionStatus, paidThroughAt: Date | null) {
  return { status, paidThroughAt };
}

describe("hasBillingAccess", () => {
  it("refuses a business with no subscription", () => {
    expect(hasBillingAccess(null, NOW)).toBe(false);
  });

  describe("incomplete: no money has arrived", () => {
    it.each([FUTURE, PAST, null])("refuses whatever the paid-through date (%s)", (paidThroughAt) => {
      expect(hasBillingAccess(subscription("incomplete", paidThroughAt), NOW)).toBe(false);
    });
  });

  describe("inactive: the provider has given up, so access ends now", () => {
    it.each([FUTURE, ONE_MS_LATER, PAST, NOW, null])("refuses even with a paid-through date of %s", (paidThroughAt) => {
      expect(hasBillingAccess(subscription("inactive", paidThroughAt), NOW)).toBe(false);
    });
  });

  describe.each(["active", "past_due", "cancelled"] as const)("%s: open only inside the paid period", (status) => {
    it("grants access while the paid-through date is ahead", () => {
      expect(hasBillingAccess(subscription(status, FUTURE), NOW)).toBe(true);
    });

    it("grants access one millisecond before the period ends", () => {
      expect(hasBillingAccess(subscription(status, ONE_MS_LATER), NOW)).toBe(true);
    });

    it("refuses at exactly the paid-through instant: there is no grace period", () => {
      expect(hasBillingAccess(subscription(status, new Date(NOW.getTime())), NOW)).toBe(false);
    });

    it("refuses once the paid-through date has passed", () => {
      expect(hasBillingAccess(subscription(status, PAST), NOW)).toBe(false);
    });

    it("refuses when nothing has been paid through", () => {
      expect(hasBillingAccess(subscription(status, null), NOW)).toBe(false);
    });
  });
});
