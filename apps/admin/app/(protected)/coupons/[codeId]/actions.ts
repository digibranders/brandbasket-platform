"use server";

import { revalidatePath } from "next/cache";
import type { ReferralFormState } from "@/components/referral-code-form";
import { retireReferralCodeFor } from "@/lib/server/referral-admin";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffCan } from "@/lib/server/staff-role";

/**
 * Saves the parts of a code that may still change: whether it is active, when it expires, and how many may redeem
 * it. The discount, the currency and the affiliate are not among them and never reach this action: members already
 * paying carry a frozen copy of the discount, on a Razorpay plan priced for it.
 *
 * `codeId` comes from the page's own params and is captured in a closure, which Next.js encrypts, so it is not
 * something the posted form can substitute.
 */
export async function retireReferralCodeAction(
  codeId: string,
  _previous: ReferralFormState,
  formData: FormData,
): Promise<ReferralFormState> {
  const staff = await requireStaffCan("money");
  const outcome = await retireReferralCodeFor({ codeId, formData });
  if (outcome.kind === "refused") {
    return { status: "error", message: outcome.refusal.message, field: outcome.refusal.field, values: {} };
  }
  await recordStaffAction(staff, { businessId: null, kind: "coupon.updated", summary: "Saved a code's settings", data: { codeId } });
  revalidatePath(`/coupons/${codeId}`);
  revalidatePath("/coupons");
  revalidatePath("/affiliates", "layout");
  return { status: "idle" };
}
