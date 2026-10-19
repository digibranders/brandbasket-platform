import type { BrandLogo } from "@brandbasket/shared/ui/logo";
import type { JoinChoice } from "@/lib/join-form";

/*
 * The name and look of this dashboard: Fynix Digital. One product, one brand, so there is one constant. It says the name and
 * logo shown and which plans are offered at sign-up (Care only; Premium is no longer sold). An account is opened with an email
 * address and the code emailed to it.
 * Browser-safe and pure.
 */
export interface Brand {
  /** The company's name in full: titles, sign-in copy. */
  readonly name: string;
  /** What copy calls the product: "Your Fynix dashboard". */
  readonly shortName: string;
  /** What copy calls the public directory the business's page appears on, in the middle of a sentence ("live on ..."). */
  readonly directory: string;
  /** Where a person writes to for help. */
  readonly contactEmail: string;
  /** Where a privacy request goes when there is no request form. */
  readonly privacyEmail: string;
  /** Where the logo's name links to on the sign-in screens. */
  readonly siteUrl: string;
  /** The logo, in white and dark, with its size. */
  readonly logo: { readonly white: string; readonly dark: string; readonly width: number; readonly height: number };
  /** The plans offered at sign-up and on the Upgrade page, in the order they are shown. */
  readonly joinChoices: readonly JoinChoice[];
  /** Whether the plans are sold with the directory listing and what comes with it: they are websites, so no. */
  readonly showsListing: boolean;
  /** What the product is, in a sentence or two: said by the logo on the checkout page when it is pressed. */
  readonly about: string;
}

export const BRAND: Brand = {
  name: "Fynix Digital",
  shortName: "Fynix",
  directory: "the local directory",
  contactEmail: "hello@fynix.digital",
  privacyEmail: "privacy@fynix.digital",
  siteUrl: "https://fynix.digital",
  logo: { white: "/brand/fynix-logo-white.svg", dark: "/brand/fynix-logo-dark.svg", width: 89, height: 37 },
  joinChoices: ["care"],
  showsListing: false,
  about: "We build your business website and look after it every month: design, hosting and care, with marketing services you can add as you grow.",
};

/** The plan a sign-up opens with when its address names none, or names one it does not sell (`free`, a typo). */
export const FYNIX_DEFAULT_CHOICE: JoinChoice = "care";

/** Where a person writes for help. */
export function supportEmailOf(brand: Brand): string {
  return brand.contactEmail;
}

/** The logo to hand to the shared screens. */
export function logoOf(brand: Brand): BrandLogo {
  return { name: brand.name, siteUrl: brand.siteUrl, email: brand.contactEmail, ...brand.logo };
}

/** Whether this brand sells the free listing. */
export function sellsFreeListing(brand: Brand): boolean {
  return brand.joinChoices.includes("listing_only");
}

/** Whether a sign-up choice may be made. The server refuses any other, whatever the form sent. */
export function offersChoice(brand: Brand, choice: JoinChoice): boolean {
  return brand.joinChoices.includes(choice);
}

/** The plan-table rows that are about the directory listing: a brand that does not sell the listing leaves them out. */
const LISTING_FEATURE_IDS: ReadonlySet<string> = new Set(["listing", "images", "videos", "competitor-ads", "listing-management", "featured", "ranking"]);

/** Whether a plan-table row (lib/plan-features.ts id) is shown. */
export function featureShownTo(id: string, brand: Brand): boolean {
  return brand.showsListing || !LISTING_FEATURE_IDS.has(id);
}

/**
 * Dashboard pages that exist only for the directory listing and what it brings. The product has no listing to put on
 * them, so the proxy answers them with the dashboard's not-found screen: a customer who types one of the addresses
 * meets "Nothing here" rather than a page about a directory they are not on.
 */
const DIRECTORY_ONLY_PATHS: readonly string[] = ["/business", "/deals", "/listing", "/advertise", "/reviews", "/leads"];

/** Whether a dashboard path is one of the directory-only pages, or anything under one. */
export function isDirectoryOnlyPath(pathname: string): boolean {
  return DIRECTORY_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
