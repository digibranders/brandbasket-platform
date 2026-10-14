import { siteConfig } from "@firstfold/shared/lib/site-config";
import type { Brand } from "@/lib/brand";

/** The Terms and the Privacy Notice live on the website. Browser-safe, so client forms can link to them. */
export const TERMS_HREF = new URL("/terms", siteConfig.url).toString();
export const PRIVACY_HREF = new URL("/privacy", siteConfig.url).toString();
/** The form on the website for asking to see, correct or delete data, or to make a complaint. */
export const PRIVACY_REQUEST_HREF = new URL("/privacy/request", siteConfig.url).toString();

export interface LegalLinks {
  readonly terms: string;
  readonly privacy: string;
  readonly privacyRequest: string;
}

/**
 * The legal pages for a brand. Firstfold's are on its website; Fynix's are on its own site, which has no privacy-request
 * form, so a request goes to its privacy mailbox.
 */
export function legalLinksFor(brand: Brand): LegalLinks {
  if (brand.siteUrl === null) return { terms: TERMS_HREF, privacy: PRIVACY_HREF, privacyRequest: PRIVACY_REQUEST_HREF };
  return {
    terms: new URL("/terms", brand.siteUrl).toString(),
    privacy: new URL("/privacy", brand.siteUrl).toString(),
    privacyRequest: `mailto:${brand.privacyEmail ?? brand.contactEmail ?? ""}`,
  };
}
