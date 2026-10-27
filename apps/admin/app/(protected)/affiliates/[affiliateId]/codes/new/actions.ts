"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReferralFormState } from "@/components/referral-code-form";
import { submittedValues } from "@/lib/form-values";
import { createReferralCodeFor } from "@/lib/server/referral-admin";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffCan } from "@/lib/server/staff-role";

/**
 * Creates a code for an affiliate. `affiliateId` comes from the page's params through a closure, which Next.js
 * encrypts, so the posted form cannot attach the code to someone else. Every rule is applied in createReferralCodeFor.
 */
export async function createAffiliateCodeAction(
  affiliateId: string,
  _previous: ReferralFormState,
  formData: FormData,
): Promise<ReferralFormState> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const outcome = await createReferralCodeFor({ formData, staffUserId: user.id, affiliateId, now: new Date() });
  if (outcome.kind !== "created") {
    const refusal =
      outcome.kind === "refused"
        ? outcome.refusal
        : { message: "That didn't save. Try again, and tell an admin if it keeps happening.", field: null };
    return { status: "error", message: refusal.message, field: refusal.field, values: submittedValues(formData) };
  }
  await recordStaffAction(staff, { businessId: null, kind: "affiliate.code_created", summary: "Created a code for an affiliate", data: { affiliateId, codeId: outcome.code.id } });
  revalidatePath(`/affiliates/${affiliateId}`);
  redirect(`/affiliates/${affiliateId}`);
}
