import { deploymentBrandId, type DeploymentBrandId } from "@firstfold/shared/lib/deployment-brand";
import type { BrandLogo } from "@firstfold/shared/ui/logo";

/*
 * The brand the staff console wears. The console has no customer host, so it takes its brand from the deployment alone:
 * PLATFORM_BRAND (copied at build time into NEXT_PUBLIC_PLATFORM_BRAND by next.config.ts, so the same answer is available
 * in client components). Browser-safe and pure. The customer dashboard's richer brand module is apps/platform/lib/brand.ts.
 */
export interface AdminBrand {
  readonly id: DeploymentBrandId;
  /** The company's name in full: titles, sign-in copy. */
  readonly name: string;
  /** The label after a page title: "Pricing · Fynix staff". */
  readonly staffLabel: string;
  /** What staff call the directory the Firstfold product lists businesses on, in a sentence. */
  readonly directoryName: string;
  /** A logo to draw in place of Firstfold's rings wordmark, or undefined for the Firstfold one. */
  readonly logo: BrandLogo | undefined;
  /** Whether this deployment runs the public directory (Firstfold Local) and what hangs off it: listings, ads, deals, places. */
  readonly sellsDirectory: boolean;
}

const FYNIX_LOGO: BrandLogo = {
  name: "Fynix Digital",
  siteUrl: "https://fynix.digital",
  white: "/brand/fynix-logo-white.svg",
  dark: "/brand/fynix-logo-dark.svg",
  width: 89,
  height: 37,
};

export function adminBrand(env: Readonly<Record<string, string | undefined>> = { PLATFORM_BRAND: process.env.NEXT_PUBLIC_PLATFORM_BRAND }): AdminBrand {
  if (deploymentBrandId(env) === "fynix") {
    return { id: "fynix", name: "Fynix Digital", staffLabel: "Fynix staff", directoryName: "the local directory", logo: FYNIX_LOGO, sellsDirectory: false };
  }
  return { id: "firstfold", name: "Firstfold", staffLabel: "Firstfold staff", directoryName: "Firstfold Local", logo: undefined, sellsDirectory: true };
}
