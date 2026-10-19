import { describe, expect, it } from "vitest";
import { adChargeDescription } from "../directory/ads";
import { PROMOTION_TAG_LABELS, promotionChargeDescription } from "../directory/promotion";
import type { DirectoryPaidTag } from "@brandbasket/db";
import { chargePricing } from "./charges";
import { isPrintableOnInvoice, normaliseInvoiceText } from "./invoice-text";
import { upgradeChargeDescription } from "./upgrade";

/**
 * Every place the code writes a charge description. A charge's description is the line the invoice prints, and an
 * invoice refuses text it cannot draw (D12), so each wording must be printable once normaliseInvoiceText has turned its
 * typographic punctuation into plain characters. The stored descriptions keep their punctuation for the app: only the
 * invoice normalises. A producer added without a case here is a producer whose payments could be held unissued.
 *
 * Producers (everything that inserts a `charges` row):
 * - plan upgrade: upgradeChargeDescription, via startUpgrade -> openPlanUpgrade
 * - ad spot won at settlement: adChargeDescription, via settleDirectoryAds
 * - listing promotion week: promotionChargeDescription, via openListingPromotionCharge
 * - blog posts unlock: chargePricing("blog_posts"), via openBlogUnlock -> openBlogPostsCharge
 * - staff charge: chargePricing for change hours, extra publish and blog posts, or staff's own wording for a custom one
 */

const PLAN = { extraHourAmountCents: 142_500, extraPublishAmountCents: 50_000, extraBlogPostsAmountCents: 99_900, blogPostBlockSize: 4 };

function expectPrintableOnInvoice(description: string): void {
  expect(isPrintableOnInvoice(normaliseInvoiceText(description)), `"${description}" prints as "${normaliseInvoiceText(description)}"`).toBe(true);
}

describe("charge descriptions on the invoice", () => {
  it("prints a plan upgrade for one day left and for many", () => {
    for (const daysLeft of [1, 2, 18, 31]) expectPrintableOnInvoice(upgradeChargeDescription(daysLeft));
  });

  it("prints an ad spot for every placement, in a month-spanning week and a plain one", () => {
    const market = { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" };
    for (const placement of ["top", "side", "profile", "home"] as const) {
      for (const weekStart of ["2026-10-05", "2026-09-28"]) {
        expectPrintableOnInvoice(adChargeDescription({ placement, spot: 2, weekStart, ...market }));
      }
    }
    expectPrintableOnInvoice(adChargeDescription({ placement: "home", spot: 1, weekStart: "2026-10-05", categorySlug: "all", citySlug: "thane", areaSlug: "all" }));
  });

  it("prints an ad spot whose market is unknown to the lists, and one cut to fit 200 characters", () => {
    expectPrintableOnInvoice(adChargeDescription({ placement: "profile", spot: 1, weekStart: "2026-10-05", categorySlug: "x".repeat(150), citySlug: "y".repeat(40), areaSlug: "z" }));
  });

  it("prints a listing promotion week for every tag", () => {
    for (const tag of Object.keys(PROMOTION_TAG_LABELS) as DirectoryPaidTag[]) expectPrintableOnInvoice(promotionChargeDescription(tag));
  });

  it("prints a blog posts unlock and each staff charge kind", () => {
    for (const kind of ["blog_posts", "change_hours", "extra_publish"] as const) expectPrintableOnInvoice(chargePricing(kind, PLAN).description);
  });

  it("prints staff's own wording for a custom charge once its curly quotes and dashes are straightened", () => {
    expectPrintableOnInvoice("Logo redesign \u2013 Dr. Rao\u2019s Dental \u00B7 2 variants\u2026");
  });
});
