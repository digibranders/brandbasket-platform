/*
 * The plan a business can buy (docs/plans/11-platform-plans.md in the BrandBasket workspace). What Managed Website includes
 * is in checkout-included.ts. Browser-safe and pure.
 */

/** The plan a business can buy. Brandbasket sells one. */
export type MembershipTier = "managed";

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = ["managed"];
