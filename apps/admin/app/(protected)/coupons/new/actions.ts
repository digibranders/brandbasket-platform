"use server";

import { redirect } from "next/navigation";
import type { ReferralFormState } from "@/components/referral-code-form";
import { submittedValues } from "@/lib/form-values";
import { createReferralCodeFor } from "@/lib/server/referral-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";

/**
 * Creates a coupon. Every rule is applied in createReferralCodeFor, on the server: the form's `required` and
 * `min`/`max` attributes are a courtesy to whoever is typing, not a control.
 */
export async function createCouponAction(_previous: ReferralFormState, formData: FormData): Promise<ReferralFormState> {
  const { user } = await requireStaffAccess();
  const outcome = await createReferralCodeFor({ formData, staffUserId: user.id, affiliateId: null, now: new Date() });
  if (outcome.kind !== "created") {
    // Creating can only succeed or be refused; the other outcomes belong to other actions.
    const refusal =
      outcome.kind === "refused"
        ? outcome.refusal
        : { message: "That didn't save. Try again, and tell an admin if it keeps happening.", field: null };
    return { status: "error", message: refusal.message, field: refusal.field, values: submittedValues(formData) };
  }
  redirect(`/coupons/${outcome.code.id}`);
}
