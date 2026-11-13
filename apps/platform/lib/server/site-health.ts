import "server-only";
import { findSiteHealthFacts, withTenantScope, type SiteHealthFacts } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { uptimeSince } from "@/lib/website/health";
import { getAppDb } from "./db";

/** The stored site checks of the signed-in business, on the customer connection (row-level security, read only). */
export function loadSiteHealth(tenant: TenantContext, now: Date): Promise<SiteHealthFacts> {
  return withTenantScope(getAppDb(), tenant, (tx) => findSiteHealthFacts(tx, uptimeSince(now)));
}
