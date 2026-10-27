"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePricingForm } from "@brandbasket/shared/lib/billing/pricing-form";
import { pricingNoticeHref, type PricingNotice } from "@/lib/pricing-notices";
import { savePriceSheet, type PriceUpdateOutcome } from "@/lib/server/pricing-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { recordStaffAction } from "@/lib/server/activity";

function noticeFor(outcome: PriceUpdateOutcome): PricingNotice {
  switch (outcome.kind) {
    case "updated":
      return "extras-updated";
    case "unchanged":
    case "no-plan":
      return outcome.kind;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled price update outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Saves one currency's extra prices. Only the superadmin reaches this: every staff account is one. */
export async function savePricesAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const form = parsePricingForm(formData);
  if (!form.ok) redirect(pricingNoticeHref(form.problem));
  const outcome = await savePriceSheet({ sheet: form.sheet, staffUserId: user.id });
  await recordStaffAction(staff, { businessId: null, kind: "pricing.saved", summary: "Saved prices", data: { result: outcome.kind } });
  revalidatePath("/pricing");
  redirect(pricingNoticeHref(noticeFor(outcome)));
}
