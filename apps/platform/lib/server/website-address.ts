import "server-only";
import { getPrimaryDomain, withTenantScope } from "@brandbasket/db";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { cache } from "react";
import { siteAddress } from "@/lib/website/address";
import { requireCustomerAccess } from "./customer-access";
import { getAppDb } from "./db";
import { getLiveWebsite } from "./onboarding";

/** The address under "Your website" on every page of the Website frame. Read once per request (the layout and the page both ask). */
export const getWebsiteAddress = cache(async (): Promise<string | null> => {
  const { tenant } = await requireCustomerAccess();
  const [live, domain] = await Promise.all([getLiveWebsite(), withTenantScope(getAppDb(), tenant, getPrimaryDomain)]);
  return siteAddress({
    liveHostname: live?.hostname ?? null,
    domainHostname: domain?.hostname ?? null,
    domainIsTemporary: domain !== null && isTemporarySubdomain(domain.hostname),
  });
});
