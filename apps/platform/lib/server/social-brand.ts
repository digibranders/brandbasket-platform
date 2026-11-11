import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { BRAND_COOKIE, chooseBrand, type BrandsView } from "@/lib/social/brands";
import { quietly } from "./quietly";
import { loadBrands, socialAutoSettings } from "./social-auto";

/** The brand the signed-in business is looking at: the workspace every Social call is made for. */
export interface SocialBrand {
  /** The workspace id in social-auto: the business's own id for its first brand, `<business id>:<key>` for the others. */
  readonly externalId: string;
  readonly name: string;
  /** All the business's brands and how many it may have, or null when the posting service knows only the one. */
  readonly view: BrandsView | null;
}

/**
 * The brand to use for this request. The business comes from the session, the choice from a cookie, and the choice counts only when it
 * is one of the business's own, not archived brands as social-auto lists them: anything else is the business's first brand. A posting
 * service that does not answer for brands, or that fails, leaves the business with its one brand, as before brands existed. Read once per request.
 */
export const socialBrand = cache(async (tenant: TenantContext): Promise<SocialBrand> => {
  const own: SocialBrand = { externalId: tenant.businessId, name: tenant.businessName, view: null };
  const settings = await quietly("social", "the social-auto settings", null, async () => socialAutoSettings());
  if (settings === null) return own;
  const view = await quietly("social", "the brands", null, () => loadBrands(settings, tenant.businessId, tenant.businessName));
  if (view === null) return own;
  const chosen = (await cookies()).get(BRAND_COOKIE)?.value;
  const brand = chooseBrand(view, tenant.businessId, chosen);
  return brand === null ? { ...own, view } : { externalId: brand.externalId, name: brand.name, view };
});
