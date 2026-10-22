import type { SubscriptionStatus } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { hasBillingAccess, hasWebsiteService } from "./access";

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

describe("hasWebsiteService", () => {
  const PAID = subscription("active", FUTURE);
  const WEBSITE = { addOn: "managed-website", status: "active" } as const;
  const DROPPED = { addOn: "managed-website", status: "active", endRequestedAt: PAST } as const;
  const SOCIAL = { addOn: "digital-growth", status: "active" } as const;

  it("is true for an active Managed Website line on a paid subscription", () => {
    expect(hasWebsiteService([SOCIAL, WEBSITE], PAID, NOW)).toBe(true);
  });

  it("keeps a dropped line until the paid month ends: it stays active until the renewal", () => {
    expect(hasWebsiteService([DROPPED], PAID, NOW)).toBe(true);
  });

  it("stops once the paid month has ended, dropped or not", () => {
    expect(hasWebsiteService([DROPPED], subscription("active", PAST), NOW)).toBe(false);
    expect(hasWebsiteService([DROPPED], subscription("active", new Date(NOW.getTime())), NOW)).toBe(false);
    expect(hasWebsiteService([WEBSITE], subscription("active", PAST), NOW)).toBe(false);
  });

  it("is false with no Managed Website line, a Social-only or SEO-only plan included", () => {
    expect(hasWebsiteService([], PAID, NOW)).toBe(false);
    expect(hasWebsiteService([SOCIAL, { addOn: "local-seo-aeo", status: "active" }], PAID, NOW)).toBe(false);
  });

  it("is false for a line that is not active yet or has gone", () => {
    expect(hasWebsiteService([{ addOn: "managed-website", status: "pending" }], PAID, NOW)).toBe(false);
    expect(hasWebsiteService([{ addOn: "managed-website", status: "removed" }], PAID, NOW)).toBe(false);
  });

  it("is false without billing access, whatever the lines say", () => {
    expect(hasWebsiteService([WEBSITE], null, NOW)).toBe(false);
    expect(hasWebsiteService([WEBSITE], subscription("inactive", FUTURE), NOW)).toBe(false);
  });
});
