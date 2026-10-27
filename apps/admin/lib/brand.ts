import type { BrandLogo } from "@brandbasket/shared/ui/logo";

/*
 * What the staff console wears: Brandbasket's name and logo. Browser-safe and pure. The customer dashboard's richer
 * brand module is apps/platform/lib/brand.ts.
 */
export interface AdminBrand {
  readonly id: "brandbasket";
  /** The company's name in full: titles, sign-in copy. */
  readonly name: string;
  /** The label after a page title: "Pricing · Brandbasket staff". */
  readonly staffLabel: string;
  /** What staff call the public directory, in a sentence. */
  readonly directoryName: string;
  /** The logo to draw. */
  readonly logo: BrandLogo;
  /** Whether this deployment runs the public directory and what hangs off it: listings, ads, deals, places. */
  readonly sellsDirectory: boolean;
}

const LOGO: BrandLogo = {
  name: "Brandbasket",
  siteUrl: "https://brandbasket.in",
  onLight: "/brand/brandbasket-logo-light.svg",
  onDark: "/brand/brandbasket-logo-dark.svg",
  width: 190,
  height: 32,
};

const BRAND: AdminBrand = { id: "brandbasket", name: "Brandbasket", staffLabel: "Brandbasket staff", directoryName: "the local directory", logo: LOGO, sellsDirectory: false };

export function adminBrand(): AdminBrand {
  return BRAND;
}
