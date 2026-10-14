"use server";

import { ProjectNotAwaitingResponseError } from "@firstfold/db";
import { redirect } from "next/navigation";
import { projectResponseNoticeHref } from "@/lib/project-response-notices";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
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
