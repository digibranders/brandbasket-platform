import { BRAND, type Brand } from "@/lib/brand";

/**
 * A brand that sells the free directory listing and shows every plan-table row: the
 * dormant shape of the product, for the tests that keep that code covered. The product itself is BRAND.
 */
export const LISTING_BRAND: Brand = {
  ...BRAND,
  joinChoices: ["listing_only", "care", "premium"],
  showsListing: true,
};
