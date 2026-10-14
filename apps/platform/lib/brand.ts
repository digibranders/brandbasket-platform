import { businessDetails } from "@firstfold/shared/lib/site-config";
import type { BrandLogo } from "@firstfold/shared/ui/logo";
import type { BrandId } from "@/lib/surfaces";
import type { JoinChoice } from "@/lib/join-form";

/*
 * The two names this one dashboard is sold under: Firstfold on app.firstfold.io, and Fynix Digital on its Local Business
 * host (LOCAL_BUSINESS_ORIGIN, lib/surfaces.ts brandForHost). Same app, same database, same plans: a brand changes the
 * name and logo shown, and which plans are offered at sign-up and upgrade (Fynix sells Care and Premium only). Browser-safe
 * and pure.
 */

export type { BrandId };

export interface Brand {
  readonly id: BrandId;
  /** The company's name in full: titles, sign-in copy. */
  readonly name: string;
  /** What copy calls the product: "Your Fynix dashboard". */
  readonly shortName: string;
  /** What copy calls the public directory the business's page appears on, in the middle of a sentence ("live on ..."). */
  readonly directory: string;
  /** Where a person writes to for help; null keeps the site's own contact address (siteConfig.email). */
  readonly contactEmail: string | null;
  /** Where a privacy request goes when the brand has no request form; null for a brand that has one. */
  readonly privacyEmail: string | null;
  /** Where the logo's name links to on the sign-in screens. Null keeps the surface's own default (the website). */
  readonly siteUrl: string | null;
  /** A logo to draw in place of Firstfold's rings wordmark, or null for the Firstfold one. */
  readonly logo: { readonly white: string; readonly dark: string; readonly width: number; readonly height: number } | null;
  /** The plans offered at sign-up and on the Upgrade page, in the order they are shown. */
  readonly joinChoices: readonly JoinChoice[];
  /**
   * What a new account is opened with, and so what its sign-up code is sent to: Firstfold's owners register with a mobile
   * number (a code is texted), Fynix's with an email address (a code is emailed). Signing in takes either, whichever an
   * account has; this only decides what the create-account form asks for.
   */
  readonly signUpWith: "phone" | "email";
  /** Whether the plans are sold with the directory listing and what comes with it: Firstfold's are, Fynix's are websites. */
  readonly showsListing: boolean;
}

export const BRANDS: Readonly<Record<BrandId, Brand>> = {
  firstfold: {
    id: "firstfold",
    name: "Firstfold",
    shortName: "Firstfold",
    directory: "Firstfold Local",
    contactEmail: null,
    privacyEmail: null,
    siteUrl: null,
    logo: null,
    joinChoices: ["listing_only", "care", "premium"],
    signUpWith: "phone",
    showsListing: true,
  },
  fynix: {
    id: "fynix",
    name: "Fynix Digital",
    shortName: "Fynix",
    // The directory is Firstfold's product and lives at firstfold.io: the Fynix host names it neutrally rather than
    // claim it, or invent a name for it.
    directory: "the local directory",
    contactEmail: "hello@fynix.digital",
    privacyEmail: "privacy@fynix.digital",
    siteUrl: "https://fynix.digital",
    logo: { white: "/brand/fynix-logo-white.svg", dark: "/brand/fynix-logo-dark.svg", width: 89, height: 37 },
    joinChoices: ["care", "premium"],
    signUpWith: "email",
    showsListing: false,
  },
};

/** The plan a Fynix sign-up opens with when its address names none, or names one it does not sell (`free`, a typo). */
export const FYNIX_DEFAULT_CHOICE: JoinChoice = "care";

/** Where a person writes for help under this brand: its own address, or the site's. */
export function supportEmailOf(brand: Brand): string {
  return brand.contactEmail ?? businessDetails.email;
}

/**
 * A plan's name as the brand says it. Plans are sold under Firstfold's name ("Firstfold Premium"), which reads as just
 * "Premium" under another brand.
 */
export function brandedPlanName(name: string, brand: Brand): string {
  return brand.id === "firstfold" ? name : name.replace(/^\s*Firstfold\s+/i, "");
}

/** The logo to hand to the shared screens: undefined for Firstfold, whose wordmark they draw themselves. */
export function logoOf(brand: Brand): BrandLogo | undefined {
  if (brand.logo === null) return undefined;
  return {
    name: brand.name,
    ...(brand.siteUrl === null ? {} : { siteUrl: brand.siteUrl }),
    ...(brand.contactEmail === null ? {} : { email: brand.contactEmail }),
    ...brand.logo,
  };
}

/** Whether this brand sells the free listing: only Firstfold does. */
export function sellsFreeListing(brand: Brand): boolean {
  return brand.joinChoices.includes("listing_only");
}

/** Whether a sign-up choice may be made under this brand. The server refuses any other, whatever the form sent. */
export function offersChoice(brand: Brand, choice: JoinChoice): boolean {
  return brand.joinChoices.includes(choice);
}

/**
 * A line of dashboard copy written for Firstfold, said in a brand's own words. For Firstfold it is the very same string.
 * For another brand the directory is named neutrally and the product name is the brand's: "Firstfold Local" becomes
 * brand.directory, "Firstfold's" the brand's name with 's, a "firstfold.io address" a "temporary address", any other
 * "Firstfold" the short name, and the site's support address the brand's own. Plan-table labels are
 * not run through this: they say "Firstfold business listing", which reads as "Business listing" (see brandedLabel).
 */
export function brandText(text: string, brand: Brand): string {
  if (brand.id === "firstfold") return text;
  const written = brand.contactEmail === null ? text : text.replaceAll(businessDetails.email, brand.contactEmail);
  return written
    .replaceAll("firstfold.io address", "temporary address")
    .replaceAll("A Firstfold address", "A temporary address")
    .replaceAll("Firstfold Local", brand.directory)
    .replaceAll("Firstfold's", `${brand.name}'s`)
    .replaceAll("Firstfold", brand.shortName);
}

/**
 * A plan-table label that leads with the product name ("Firstfold business listing", "10% off Firstfold digital marketing
 * services"), without it for another brand ("Business listing", "10% off digital marketing services"): what the plan
 * gives is the listing and the marketing, not whose they are.
 */
export function brandedLabel(label: string, brand: Brand): string {
  if (brand.id === "firstfold") return label;
  const stripped = label.replace(/Firstfold /g, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** The plan-table rows that are about the directory listing: a brand that does not sell the listing leaves them out. */
const LISTING_FEATURE_IDS: ReadonlySet<string> = new Set(["listing", "images", "videos", "competitor-ads", "listing-management", "featured", "ranking"]);

/** Whether a plan-table row (lib/plan-features.ts id) is shown under this brand. */
export function featureShownTo(id: string, brand: Brand): boolean {
  return brand.showsListing || !LISTING_FEATURE_IDS.has(id);
}

/**
 * Dashboard pages that exist only for the directory listing and what it brings. A brand that does not sell the listing
 * (showsListing false) has nothing to put on them, so the proxy answers them with the dashboard's not-found screen: a
 * customer who types one of the addresses meets "Nothing here" rather than a page about a directory they are not on.
 */
const DIRECTORY_ONLY_PATHS: readonly string[] = ["/business", "/deals", "/listing", "/advertise", "/reviews", "/leads"];

/** Whether a dashboard path is one of the directory-only pages, or anything under one. */
export function isDirectoryOnlyPath(pathname: string): boolean {
  return DIRECTORY_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
