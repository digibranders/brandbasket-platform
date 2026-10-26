"use server";

import { assignLead, listAssignableSupportStaff, setLeadStatusUnlessSystemSet } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { getStaffDb } from "@/lib/server/db";
import { sendSetupLink } from "@/lib/server/invites";
import { attachAccountAndSyncTenant } from "@/lib/server/lead-repair";
import { applyLeadDetails } from "@/lib/server/lead-updates";
import { requireStaffAccess } from "@/lib/server/staff-access";

function readLeadId(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || value === "") throw new Error("Missing lead id");
  return value;
}

/**
 * Saves the "Update this lead" form. Staff can never choose Paid or Account created, and can never move a lead out
 * of either: applyLeadDetails refuses the first and the database guards the second, whatever the page showed.
 */
export async function updateLeadDetails(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  await applyLeadDetails(getStaffDb(), leadId, formData);
  revalidatePath(`/leads/${leadId}`);
}

export async function sendSetupLinkAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  await sendSetupLink(leadId, user.id);
  revalidatePath(`/leads/${leadId}`);
}

/**
 * Repairs a customer whose account exists but whose business does not, which a redemption that failed after the
 * account was created can leave behind once the setup link is gone. Refuses a lead that already has a business,
 * so running it twice cannot hand one customer two tenants, and records the staff member who ran it on the lead.
 */
export async function attachAccountAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  await attachAccountAndSyncTenant(getStaffDb(), { leadId, attachedByStaffId: user.id });
  revalidatePath(`/leads/${leadId}`);
}

/**
 * Mark talking (`call_done`) and Mark lost (`lost`) in the open enquiry. A lead the system has already moved on (account
 * created, paid) keeps its status: the database refuses the change.
 */
export async function setEnquiryStatusAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  const status = formData.get("status");
  if (status !== "call_done" && status !== "lost") throw new Error(`Not an enquiry status: ${String(status)}`);
  await setLeadStatusUnlessSystemSet(getStaffDb(), leadId, status);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/** Gives the open enquiry to an active staff member, or to nobody. */
export async function assignLeadAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  const raw = formData.get("assignee");
  const assignee = typeof raw === "string" && raw !== "" ? raw : null;
  const db = getStaffDb();
  if (assignee !== null && !(await listAssignableSupportStaff(db)).some((member) => member.userId === assignee)) {
    throw new Error("Only an active staff member can own an enquiry.");
  }
  await assignLead(db, leadId, assignee);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

