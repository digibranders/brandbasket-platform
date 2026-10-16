"use server";

import { getPrimaryDomain, ProjectNotAwaitingResponseError, recordDomainDnsCheck, withTenantScope } from "@fynix/db";
import { redirect } from "next/navigation";
import { isTemporarySubdomain } from "@fynix/shared/lib/onboarding/domain-form";
import { CHECK_FAILED_MESSAGE, type ConnectDomainState } from "@/lib/connect-domain-state";
import { projectResponseNoticeHref } from "@/lib/project-response-notices";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { notifyTeamDomainConnected } from "@/lib/server/domain-alert";
import { checkDomainDns } from "@/lib/server/domain-check";
import { respondToPreview, type PreviewResponse } from "@/lib/server/project-response";

/**
 * Approving a preview, or asking for changes. Both run as the platform's staff-privileged connection: see
 * approveProjectPreview's doc comment for why a customer action needs that (the database itself reserves every
 * transition but onboarding to submitted for staff), so requireCustomerAccess is what proves this request is really
 * the business's own.
 */
async function respond(response: PreviewResponse): Promise<void> {
  const { tenant } = await requireCustomerAccess();

  try {
    await respondToPreview(getStaffDb(), { businessId: tenant.businessId, businessName: tenant.businessName, response }, new Date());
  } catch (error) {
    if (error instanceof ProjectNotAwaitingResponseError) redirect(projectResponseNoticeHref("not-ready"));
    throw error;
  }

  redirect(projectResponseNoticeHref(response.kind === "approve" ? "approved" : "revisions-requested"));
}

export async function approvePreviewAction(): Promise<void> {
  await respond({ kind: "approve" });
}

/** No written detail is collected here on purpose: the customer is pointed at booking a call instead. */
export async function requestPreviewChangesAction(): Promise<void> {
  await respond({ kind: "revisions" });
}

/**
 * "Check my domain": looks up the DNS of the business's own stored domain and reports whether it now points at the
 * website. Nothing in the form is read: the address comes from the database for the signed-in business. It only runs once
 * staff have asked the customer to connect it, and for a live site too (only a domain in the DNS step has its status changed); the result is recorded, and the team is told the
 * first time it finds the domain connected. Recording uses the staff connection because the customer's role cannot change a
 * domain's status, and the sign-in above is what proves this is the business's own.
 */
export async function checkDomainAction(): Promise<ConnectDomainState> {
  const { tenant } = await requireCustomerAccess();
  const domain = await withTenantScope(getAppDb(), tenant, getPrimaryDomain);
  if (domain === null || isTemporarySubdomain(domain.hostname)) {
    return { status: "error", message: "There’s no domain of your own to check yet." };
  }
  if (domain.status === "pending") {
    return { status: "error", message: "It isn’t time to connect your domain yet. We’ll email you when it is." };
  }

  try {
    const check = await checkDomainDns(domain.hostname);
    const recorded = await recordDomainDnsCheck(getStaffDb(), { businessId: tenant.businessId, hostname: domain.hostname, result: check.overall });
    if (recorded.becameConnected) await notifyTeamDomainConnected(tenant.businessId, tenant.businessName, domain.hostname);
    return { status: "checked", overall: check.overall, records: check.records };
  } catch (error) {
    console.error("A customer's domain could not be looked up.", { businessId: tenant.businessId, error });
    return { status: "error", message: CHECK_FAILED_MESSAGE };
  }
}
