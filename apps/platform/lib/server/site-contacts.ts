import "server-only";
import { countSiteEvents, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { measuredContacts, SITE_CONTACT_MEASURED_DAYS, SITE_CONTACT_WINDOW_DAYS, type SiteContacts } from "@/lib/site-contacts";
import { getAppDb } from "./db";
import { quietly } from "./quietly";

const DAY_MS = 86_400_000;

/** The website's contacts over the last 30 days, or null when it has reported none lately or the read failed (the page then leaves them out). */
export async function loadSiteContacts(tenant: TenantContext, now: Date): Promise<SiteContacts | null> {
  return quietly("website", "the website's contacts", null, () =>
    withTenantScope(getAppDb(), tenant, async (tx) => {
      const [recent, longer] = await Promise.all([
        countSiteEvents(tx, tenant.businessId, { from: new Date(now.getTime() - SITE_CONTACT_WINDOW_DAYS * DAY_MS), to: now }),
        countSiteEvents(tx, tenant.businessId, { from: new Date(now.getTime() - SITE_CONTACT_MEASURED_DAYS * DAY_MS), to: now }),
      ]);
      return measuredContacts(recent, longer);
    }),
  );
}
