"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePricingForm } from "@fynix/shared/lib/billing/pricing-form";
import { pricingNoticeHref, type PricingNotice } from "@/lib/pricing-notices";
import { savePriceSheet, type PriceUpdateOutcome } from "@/lib/server/pricing-admin";
import { requireStaffCan } from "@/lib/server/staff-role";

function noticeFor(outcome: PriceUpdateOutcome): PricingNotice {
  switch (outcome.kind) {
    case "updated":
      return outcome.monthlyChanged ? "monthly-updated" : "extras-updated";
    case "unchanged":
    case "no-plan":
    case "below-referral":
    case "provider-failed":
      return outcome.kind;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled price update outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Saves one currency's prices. Only the superadmin reaches this: every staff account is one. */
export async function savePricesAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("money");
  const form = parsePricingForm(formData);
  if (!form.ok) redirect(pricingNoticeHref(form.problem));
  const outcome = await savePriceSheet({ sheet: form.sheet, staffUserId: user.id }, new Date());
  revalidatePath("/pricing");
  redirect(pricingNoticeHref(noticeFor(outcome)));
}
