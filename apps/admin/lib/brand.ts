import type { BrandLogo } from "@fynix/shared/ui/logo";

/*
 * What the staff console wears: Fynix Digital's name and logo. Browser-safe and pure. The customer dashboard's richer
 * brand module is apps/platform/lib/brand.ts.
 */
export interface AdminBrand {
  readonly id: "fynix";
  /** The company's name in full: titles, sign-in copy. */
  readonly name: string;
  /** The label after a page title: "Pricing · Fynix staff". */
  readonly staffLabel: string;
  /** What staff call the public directory, in a sentence. */
  readonly directoryName: string;
  /** The logo to draw. */
  readonly logo: BrandLogo;
  /** Whether this deployment runs the public directory and what hangs off it: listings, ads, deals, places. */
  readonly sellsDirectory: boolean;
}

const LOGO: BrandLogo = {
  name: "Fynix Digital",
  siteUrl: "https://fynix.digital",
  white: "/brand/fynix-logo-white.svg",
  dark: "/brand/fynix-logo-dark.svg",
  width: 89,
  height: 37,
};

const BRAND: AdminBrand = { id: "fynix", name: "Fynix Digital", staffLabel: "Fynix staff", directoryName: "the local directory", logo: LOGO, sellsDirectory: false };

export function adminBrand(): AdminBrand {
  return BRAND;
}
