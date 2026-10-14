import type { ChargeKind, Plan } from "@firstfold/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@firstfold/billing/tax";

/**
 * The kinds staff can add from the staff console. A `listing_promotion` is not one of them: only the customer opens
 * it, from the Listing page, and its tag and price are fixed (lib/directory/promotion.ts). Nor is a `directory_ad`:
 * only the ad auction's settlement opens one, at the price the auction set (lib/directory/ads.ts). Nor is a
 * `press_release`: only the customer buys one, from the Add-ons page, at the catalogue price.
 */
export type StaffChargeKind = Exclude<
  ChargeKind,
  "listing_promotion" | "directory_ad" | "plan_upgrade" | "press_release"
>;

/** Staff's kinds, in the order the staff console lists them. */
export const STAFF_CHARGE_KINDS: readonly StaffChargeKind[] = ["change_hours", "extra_publish", "blog_posts", "custom"];

/** Whether `kind` is one staff can add. */
export function isStaffChargeKind(kind: string): kind is StaffChargeKind {
  return (STAFF_CHARGE_KINDS as readonly string[]).includes(kind);
}

/** What each kind is called in the staff console. */
export const CHARGE_KIND_LABELS: Readonly<Record<ChargeKind, string>> = {
  change_hours: "Extra change hours",
  extra_publish: "Extra publish",
  blog_posts: "More blog posts",
  custom: "Something else",
  listing_promotion: "Listing tag",
  directory_ad: "Ad spot",
  plan_upgrade: "Upgrade to Premium",
  press_release: "Press release",
};

type ChargePlan = Pick<
  Plan,
  "extraHourAmountCents" | "extraPublishAmountCents" | "extraBlogPostsAmountCents" | "blogPostBlockSize"
>;

/** Where a new charge starts: its net unit price (null means staff set it), its description, and what one unit is. */
export interface ChargePricing {
  readonly unitAmountCents: number | null;
  readonly description: string;
  readonly unit: string | null;
}

/**
 * A charge's starting price and wording, from the client's plan, so staff never type a list price and a customer in
 * India is always quoted in rupees. Only a custom charge is priced by hand.
 */
export function chargePricing(kind: StaffChargeKind, plan: ChargePlan): ChargePricing {
  switch (kind) {
    case "change_hours":
      return { unitAmountCents: plan.extraHourAmountCents, description: "Extra change hours", unit: "hour" };
    case "extra_publish":
      return { unitAmountCents: plan.extraPublishAmountCents, description: "Extra publish", unit: "publish" };
    case "blog_posts":
      return {
        unitAmountCents: plan.extraBlogPostsAmountCents,
        description: `${plan.blogPostBlockSize} more blog posts`,
        unit: `block of ${plan.blogPostBlockSize} posts`,
      };
    case "custom":
      return { unitAmountCents: null, description: "", unit: null };
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled charge kind: ${String(unhandled)}`);
    }
  }
}

/** What a charge takes: net unit price times quantity, with the tax on top (chargedAmountCents rounds it). */
export function chargeAmountCents(unitAmountCents: number, quantity: number, taxRateBasisPoints: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`A charge's quantity must be a positive whole number, received ${quantity}`);
  }
  return chargedAmountCents(unitAmountCents * quantity, 0, taxRateBasisPoints);
}

/** How many blog posts a business may have: the plan's included posts, plus a block for every block paid for. */
export function blogAllowance(plan: Pick<Plan, "includedBlogPosts" | "blogPostBlockSize">, paidBlocks: number): number {
  return plan.includedBlogPosts + plan.blogPostBlockSize * paidBlocks;
}

/** A charge as a line: "Extra change hours · 2 h", "Extra publish × 3", or the description alone for one of it. */
export function chargeLabel(charge: { readonly kind: ChargeKind; readonly description: string; readonly quantity: number }): string {
  if (charge.kind === "change_hours") return `${charge.description} · ${charge.quantity} h`;
  return charge.quantity === 1 ? charge.description : `${charge.description} × ${charge.quantity}`;
}
