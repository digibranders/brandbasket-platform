"use server";

import { createLead } from "@firstfold/db";
import { redirect } from "next/navigation";
import { billingCurrencyForPhone } from "@firstfold/shared/lib/billing/currency-for-phone";
import { leadValuesFrom, parseLeadForm } from "@firstfold/shared/lib/lead-form";
import type { LeadFormState } from "@firstfold/shared/lib/lead-form-fields";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

const PROBLEM_MESSAGE = "That didn't save. Try again, and tell an admin if it keeps happening.";

/** Staff adding a lead that arrived by phone or in person, validated exactly like the public form. */
export async function createLeadAction(_previous: LeadFormState, formData: FormData): Promise<LeadFormState> {
  await requireStaffAccess();

  const parsed = parseLeadForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.message, field: parsed.field, values: leadValuesFrom(formData) };
  }

  let leadId: string;
  try {
    const created = await createLead(getStaffDb(), { ...parsed.data, currency: billingCurrencyForPhone(parsed.data.phone) });
    leadId = created.id;
  } catch (error) {
    console.error("A staff member could not create a lead.", error);
    return { status: "error", message: PROBLEM_MESSAGE, field: null, values: leadValuesFrom(formData) };
  }

  redirect(`/leads/${leadId}`);
}
