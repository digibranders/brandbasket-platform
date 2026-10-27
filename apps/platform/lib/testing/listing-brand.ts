import { BRAND, type Brand } from "@/lib/brand";

/**
 * A brand that sells the free directory listing: the dormant shape of the product, for the tests that keep the sign-up code covered. The product itself is BRAND.
 */
export const LISTING_BRAND: Brand = {
  ...BRAND,
  joinChoices: ["listing_only", "managed"],
  about: "A directory listing for your business, with a website plan you can add.",
};
