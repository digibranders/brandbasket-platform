"use server";

import { clearPriceOverride, findBillingState, listPriceOverridesForBusiness } from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId, perCycle } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";

const posted = z.object({
  businessId: z.uuid(),
  addOn: z.string().refine(isMonthlyAddOnId),
  billingInterval: z.enum(["month", "year"]),
});

/**
 * Removes one agreed price (plan 66, 3.7): from then on a basket re-priced from the catalogue (a reactivation, Keep my plan, a service
 * joining the plan) uses the list price for that service and period. What the customer is billed now is untouched: it is frozen on their
 * subscription lines. Money capability only; a form that is not ours, or a price already gone, changes nothing.
 */
export async function clearPriceOverrideAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const parsed = posted.safeParse({ businessId: formData.get("businessId"), addOn: formData.get("addOn"), billingInterval: formData.get("billingInterval") });
  if (!parsed.success) return;
  const { businessId, addOn, billingInterval } = parsed.data;
  if (!isMonthlyAddOnId(addOn)) return;
  const db = getStaffDb();
  const currency = (await findBillingState(db, businessId))?.currency ?? "INR";
  const held = (await listPriceOverridesForBusiness(db, businessId)).find((row) => row.addOn === addOn && row.billingInterval === billingInterval);
  if (held !== undefined && (await clearPriceOverride(db, { businessId, addOn, billingInterval }))) {
    await recordStaffAction(staff, {
      businessId,
      kind: "price_override.cleared",
      summary: `Removed the agreed price for ${addOnById(addOn).title}: ${formatMoney(held.netCents, currency)} ${perCycle(billingInterval)}`,
      data: { addOn, billingInterval, netCents: held.netCents },
    });
  }
  revalidatePath(`/clients/${businessId}/billing`);
  redirect(`/clients/${businessId}/billing`);
}
