"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PaymentLinkFormState } from "@/components/payment-link-form-state";
import { parsePaymentLinkForm } from "@/lib/payment-link-form";
import { loadDealEditPage, updateDealFor } from "@/lib/server/payment-links-admin";
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
 * Saves an edit of a deal whose advance is paid (plan 66, step 6). `linkId` is bound by the page (encrypted by Next), so the posted form
 * cannot swap it. The country and the deal type come from the link, and the advance is the one received, whatever the form posted; every
 * other rule runs again in updateDealFor.
 */
export async function editDealAction(linkId: string, _previous: PaymentLinkFormState, formData: FormData): Promise<PaymentLinkFormState> {
  const staff = await requireStaffCan("money");
  const failure = (message: string, field: Extract<PaymentLinkFormState, { status: "error" }>["field"]): PaymentLinkFormState => ({
    status: "error",
    message,
    field,
    values: typedAnswers(formData),
  });

  const page = uuid.safeParse(linkId).success ? await loadDealEditPage(linkId, new Date()) : null;
  if (page === null) return failure("That deal no longer exists.", null);
  if (page.link.advanceCents === null) return failure("Only a paid deal can be edited.", null);
  formData.set("countryCode", page.link.countryCode);
  formData.set("dealType", "paid");

  const parsed = parsePaymentLinkForm(formData, { fixedAdvanceCents: page.link.advanceCents });
  if (!parsed.ok) return failure(parsed.message, parsed.field);
  const outcome = await updateDealFor({ form: parsed.draft, linkId, staff, now: new Date() });
  if (outcome.kind === "not-found") return failure("That deal no longer exists.", null);
  if (outcome.kind === "refused") return failure(outcome.message, outcome.field);
  revalidatePath("/payment-links");
  if (outcome.businessId === null) return redirect("/payment-links");
  revalidatePath(`/clients/${outcome.businessId}/billing`);
  return redirect(`/clients/${outcome.businessId}/billing`);
}
