"use server";

import { ProjectNotAwaitingResponseError } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { respondToPreview, type PreviewResponse } from "@/lib/server/project-response";
import { askAboutHref } from "@/lib/website/tabs";
import { websiteNoticeHref } from "@/lib/website/notices";

/**
 * Answering a preview. Both run as the platform's staff-privileged connection: the database reserves every project move
 * but onboarding to submitted for staff (see approveProjectPreview), so requireCustomerAccess is what proves this request
 * is the business's own. The business comes only from the session; nothing in the form is read.
 */
async function respond(response: PreviewResponse): Promise<void> {
  const { tenant } = await requireCustomerAccess();
  try {
    await respondToPreview(getStaffDb(), { businessId: tenant.businessId, businessName: tenant.businessName, response }, new Date());
  } catch (error) {
    if (error instanceof ProjectNotAwaitingResponseError) redirect(websiteNoticeHref("not-ready"));
    throw error;
  }
}

export async function approvePreviewAction(): Promise<void> {
  await respond({ kind: "approve" });
  redirect(websiteNoticeHref("approved"));
}

/** Moves the project to Revisions, counting the round and telling the team, then opens the Ask for a change form for the preview. */
export async function askForChangesAction(): Promise<void> {
  await respond({ kind: "revisions" });
  redirect(`${askAboutHref("Preview")}&from=preview`);
}
