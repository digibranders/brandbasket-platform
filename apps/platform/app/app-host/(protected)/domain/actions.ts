"use server";

import { DomainTakenError, getPrimaryDomain, requestDomainMove, withTenantScope } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { clientSiteBaseDomain, isTemporarySubdomain, parseDomainForm, reservedHostnamesFrom } from "@fynix/shared/lib/onboarding/domain-form";
import { siteConfig } from "@fynix/shared/lib/site-config";
import { MOVE_NOT_AVAILABLE_MESSAGE, MOVE_TAKEN_MESSAGE, type MoveDomainState } from "@/lib/move-domain-state";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { notifyTeamDomainRequested } from "@/lib/server/domain-alert";
import { serverEnv } from "@/lib/server/env";
import { getLiveWebsite } from "@/lib/server/onboarding";

/**
 * A customer whose website is live on the free address asks to move to a domain of their own. Checked again here, whatever the
 * page showed: it must really be live on a free address, and the domain goes through the same checks as step 04 (a valid name,
 * not one of ours, the ownership box ticked). It is saved beside their current address, which keeps working; the team is told
 * after it is saved, and a failed email never undoes the request.
 */
export async function requestOwnDomainAction(_previous: MoveDomainState, formData: FormData): Promise<MoveDomainState> {
  const { tenant } = await requireCustomerAccess();

  const [primary, live] = await Promise.all([withTenantScope(getAppDb(), tenant, getPrimaryDomain), getLiveWebsite()]);
  if (live === null || primary === null || !isTemporarySubdomain(primary.hostname)) {
    return { status: "error", message: MOVE_NOT_AVAILABLE_MESSAGE, field: null };
  }

  const env = serverEnv();
  const baseDomain = clientSiteBaseDomain();
  const reserved = [
    ...reservedHostnamesFrom([siteConfig.url, siteConfig.appUrl, env.APP_ORIGIN, env.ADMIN_ORIGIN]),
    ...(baseDomain === null ? [] : [baseDomain]),
  ];
  const parsed = parseDomainForm(formData, reserved);
  if (!parsed.success) {
    return { status: "error", message: parsed.message, field: parsed.field === "ownerConfirmed" ? "ownerConfirmed" : "domain" };
  }

  try {
    await withTenantScope(getAppDb(), tenant, (tx) => requestDomainMove(tx, { hostname: parsed.data.hostname, ownerConfirmedAt: new Date() }));
  } catch (error) {
    if (error instanceof DomainTakenError) return { status: "error", message: MOVE_TAKEN_MESSAGE, field: "domain" };
    throw error;
  }

  await notifyTeamDomainRequested(tenant.businessId, tenant.businessName, parsed.data.hostname);
  revalidatePath("/domain");
  return { status: "idle" };
}
