"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findReferralCodeById } from "@fynix/db";
import type { ReferralFormState } from "@/components/referral-code-form";
import { getStaffDb } from "@/lib/server/db";
import { deleteReferralCodeFor } from "@/lib/server/referral-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";

/**
 * Deletes a code for good. The confirmation tick and the "nobody is on it" rule are both enforced in
 * deleteReferralCodeFor, on the server, so a posted form cannot skip either. On success there is no page left to
 * return to, so it goes back to the list the code came from: the coupons, or its affiliate.
 *
 * `codeId` comes from the page's own params through a closure, which Next.js encrypts; the posted form cannot
 * name a different code to delete.
 */
export async function deleteReferralCodeAction(
  codeId: string,
  _previous: ReferralFormState,
  formData: FormData,
): Promise<ReferralFormState> {
  await requireStaffAccess();
  const code = await findReferralCodeById(getStaffDb(), codeId);
  const outcome = await deleteReferralCodeFor({ codeId, formData });
  if (outcome.kind === "refused") {
    return { status: "error", message: outcome.refusal.message, field: outcome.refusal.field, values: {} };
  }
  const back = code?.affiliateId == null ? "/coupons" : `/affiliates/${code.affiliateId}`;
  revalidatePath(back);
  redirect(back);
}
