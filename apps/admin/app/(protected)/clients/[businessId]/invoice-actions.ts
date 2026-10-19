"use server";

import { saveBillingProfile } from "@brandbasket/db";
import { firstBillingDetailsProblem, parseBillingDetails } from "@brandbasket/shared/lib/billing/billing-details-form";
import { logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StaffBillingDetailsState } from "@/lib/billing-details-form-state";
import { submittedValues } from "@/lib/form-values";
import { invoiceNoticeHref } from "@/lib/invoice-notices";
import { getStaffDb } from "@/lib/server/db";
import { issueClientMissingInvoice } from "@/lib/server/invoices-admin";
import { requireStaffCan } from "@/lib/server/staff-role";

const idSchema = z.uuid();

function readId(value: FormDataEntryValue | null, what: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${what} must be a valid id.`);
  return parsed.data;
}

/**
 * Issues the invoice a client's payment is missing, dated today (D16). The payment must be one the client is listed as
 * missing an invoice for; the work and its refusals are in issueClientMissingInvoice.
 */
export async function issueMissingInvoiceAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("money");
  const businessId = readId(formData.get("businessId"), "The invoice's business");
  const paymentId = readId(formData.get("paymentId"), "The invoice's payment");
  const notice = await issueClientMissingInvoice(businessId, paymentId, new Date(), user.id);
  revalidatePath(`/clients/${businessId}`);
  revalidatePath("/invoices");
  redirect(invoiceNoticeHref(businessId, notice));
}

/**
 * Corrects a client's billing details (D14) with the rules the customer's own form uses. They apply to invoices issued
 * from now on; issued invoices stay as they are (D2). The write is on the staff connection, which row-level security
 * does not limit, so the business comes from the form and is checked here to be an id. The audit line names the staff
 * member and the business, never the values: they are a customer's name, GSTIN and address.
 */
export async function saveClientBillingDetailsAction(
  _previous: StaffBillingDetailsState,
  formData: FormData,
): Promise<StaffBillingDetailsState> {
  const { user } = await requireStaffCan("money");
  const businessId = readId(formData.get("businessId"), "The billing details' business");
  const parsed = parseBillingDetails(formData);
  if (!parsed.ok) return { status: "error", ...firstBillingDetailsProblem(parsed.errors), values: submittedValues(formData) };
  await saveBillingProfile(getStaffDb(), { businessId, ...parsed.details });
  logBillingEvent("info", "billing-details-saved-by-staff", { businessId, savedBy: user.id });
  revalidatePath(`/clients/${businessId}`);
  return { status: "saved" };
}
