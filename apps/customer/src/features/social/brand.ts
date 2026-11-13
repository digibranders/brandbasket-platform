import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { BRAND_COOKIE, chooseBrand, readBrands, type BrandsView } from "./brands";
import { callPostingService } from "./posting-service";
import { postingServiceSettings } from "./analytics/rules";

/** The brand the signed-in business is looking at: the workspace every Social call is made for. */
export interface SocialBrand {
  /** The workspace id in the posting service: the business's own id for its first brand, `<business id>:<key>` for the others. */
  readonly externalId: string;
  readonly name: string;
  /** All the business's brands and how many it may have, or null when the posting service knows only the one. */
  readonly view: BrandsView | null;
}

type Reader = Pick<CustomerContext, "businessId" | "businessName">;

/** The business's brands as the posting service lists them, or null when it does not answer for brands. */
export async function fetchBrands(business: Reader): Promise<BrandsView | null> {
  const answer = await callPostingService(`/api/v1/workspaces?group=${encodeURIComponent(business.businessId)}`, { method: "GET" });
  if (answer.status === 404 || answer.status === 400) return null;
  if (answer.status !== 200) throw new Error(`The posting service answered ${answer.status} for the brands.`);
  return readBrands(answer.body, business.businessName);
}

/**
 * The brand to use for this request. The business comes from the session and the choice from a cookie; the choice counts only when it
 * is one of the business's own, not archived brands as the posting service lists them, and anything else is the business's first brand.
 * A server with no posting service, or a service that does not answer for brands, leaves the business with its one brand. A failed read is
 * reported and also leaves the one brand, so the page still draws. Read once per request.
 */
export const socialBrand = cache(async (businessId: string, businessName: string): Promise<SocialBrand> => {
  const own: SocialBrand = { externalId: businessId, name: businessName, view: null };
  if (postingServiceSettings(process.env) === null) return own;
  let view: BrandsView | null;
  try {
    view = await fetchBrands({ businessId, businessName });
  } catch (error) {
    reportError(error, { area: "social.brands" });
    return own;
  }
  if (view === null) return own;
  const chosen = (await cookies()).get(BRAND_COOKIE)?.value;
  const brand = chooseBrand(view, businessId, chosen);
  return brand === null ? { ...own, view } : { externalId: brand.externalId, name: brand.name, view };
});

/** The brand for a signed-in customer. */
export const brandOf = (customer: Reader): Promise<SocialBrand> => socialBrand(customer.businessId, customer.businessName);
