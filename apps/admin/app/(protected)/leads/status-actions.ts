"use server";

import { findLead, setLeadStatusUnlessSystemSet } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { getStaffDb } from "@/lib/server/db";
import { recordStaffAction } from "@/lib/server/activity";
import { createEnquiryActions, type EnquiryStatusResult, type SetupLinkResult } from "@/lib/server/enquiry-status-actions";
import { sendSetupLink } from "@/lib/server/invites";
import { requireStaffAccess } from "@/lib/server/staff-access";

const actions = createEnquiryActions({
  requireStaff: requireStaffAccess,
  readLead: async (leadId) => {
    const lead = await findLead(getStaffDb(), leadId);
    return lead === null ? null : { status: lead.status, email: lead.email, hasBusiness: lead.businessId !== null };
  },
  setStatus: (leadId, status) => setLeadStatusUnlessSystemSet(getStaffDb(), leadId, status),
  sendLink: sendSetupLink,
  record: (granted, entry) => recordStaffAction(granted, { businessId: null, ...entry }),
  revalidate: (leadId) => {
    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
  },
});

export async function markContactedAction(leadId: string): Promise<EnquiryStatusResult> {
  return actions.markContacted(leadId);
}
export async function markLostAction(leadId: string): Promise<EnquiryStatusResult> {
  return actions.markLost(leadId);
}
export async function restoreEnquiryStatusAction(leadId: string, to: string): Promise<EnquiryStatusResult> {
  return actions.restore(leadId, to);
}
export async function sendSetupLinkNowAction(leadId: string): Promise<SetupLinkResult> {
  return actions.sendSetupLink(leadId);
}
