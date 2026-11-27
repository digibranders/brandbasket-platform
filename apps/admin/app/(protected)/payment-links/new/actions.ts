"use server";

import { z } from "zod";
import type { PaymentLinkFormState } from "@/components/payment-link-form-state";
import { parsePaymentLinkForm } from "@/lib/payment-link-form";
import { serverEnv } from "@/lib/server/env";
import { createPaymentLinkFor } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";

const uuid = z.uuid();

/** Every typed answer by field name, with the services as a list, so a refused save puts the whole form back. */
function typedAnswers(formData: FormData): Record<string, string | readonly string[]> {
  const values: Record<string, string | readonly string[]> = {};
  for (const name of new Set(formData.keys())) {
    if (/^\$ACTION/.test(name)) continue;
    const all = formData.getAll(name).filter((value): value is string => typeof value === "string");
    values[name] = name === "service" ? all : (all[0] ?? "");
  }
  return values;
}

/**
 * Makes a payment link. `origin` is the enquiry or business the page was opened for, bound by the page (a bound argument is
 * encrypted by Next, so the posted form cannot swap it). Every rule runs again here: the form's own checks are a courtesy.
 */
export async function createPaymentLinkAction(
  origin: { readonly leadId: string | null; readonly businessId: string | null },
  _previous: PaymentLinkFormState,
  formData: FormData,
): Promise<PaymentLinkFormState> {
  const staff = await requireStaffCan("money");
  const failure = (message: string, field: Extract<PaymentLinkFormState, { status: "error" }>["field"]): PaymentLinkFormState => ({
    status: "error",
    message,
    field,
    values: typedAnswers(formData),
  });

  const parsed = parsePaymentLinkForm(formData);
  if (!parsed.ok) return failure(parsed.message, parsed.field);
  const leadId = origin.leadId !== null && uuid.safeParse(origin.leadId).success ? origin.leadId : null;
  const businessId = origin.businessId !== null && uuid.safeParse(origin.businessId).success ? origin.businessId : null;

  const outcome = await createPaymentLinkFor({ form: parsed.draft, staff, leadId, businessId, now: new Date() });
  if (outcome.kind === "refused") return failure(outcome.message, outcome.field);
  return {
    status: "created",
    address: new URL(`/pay/${outcome.token}`, serverEnv().APP_ORIGIN).toString(),
    customer: outcome.link.businessName ?? outcome.link.contactName ?? outcome.link.email ?? "the customer",
    expiresAt: outcome.link.expiresAt.toISOString(),
  };
}
