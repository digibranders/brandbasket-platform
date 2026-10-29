import "server-only";
import { cache } from "react";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { ServiceKey } from "@/lib/first-look";
import { loadSetupServices } from "./first-look";

/**
 * Which of the three services the plan has (the live lines of bundled_add_ons, and the Social and Search ones bought
 * the older way), in the order Website, Social, Search. The sidebar, the intent list on new requests and the Business page
 * read this, so none of them waits on the To do page. A failed read gives none rather than breaking the page. Read once
 * per request, keyed on the tenant object (requireCustomerAccess hands every caller the same one).
 */
export const loadActiveServices = cache(async (tenant: TenantContext): Promise<readonly ServiceKey[]> => (await loadSetupServices(tenant)) ?? []);
