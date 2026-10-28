"use server";

import { redirect } from "next/navigation";
import type { AffiliateFormState } from "@/components/affiliate-forms";
import { submittedValues } from "@/lib/form-values";
import { createAffiliateFor, emailLoginLinkFor } from "@/lib/server/affiliate-admin";
import { serverEnv } from "@/lib/server/env";
import { requireStaffCan } from "@/lib/server/staff-role";
import { recordStaffAction } from "@/lib/server/activity";

/** Creates an affiliate and emails them their sign-in link; every rule is applied in createAffiliateFor, on the server. */
export async function createAffiliateAction(_previous: AffiliateFormState, formData: FormData): Promise<AffiliateFormState> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const outcome = await createAffiliateFor({ formData, staffUserId: user.id });
  if (outcome.kind === "refused") {
    return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  }
  if (outcome.kind !== "saved") throw new Error(`Creating an affiliate answered ${outcome.kind}`);
  await recordStaffAction(staff, { businessId: null, kind: "affiliate.created", summary: "Added an affiliate", data: { affiliateId: outcome.affiliate.id } });
  const { id, email } = outcome.affiliate;
  // With an email on file, the sign-in link goes straight to it; the page says whether that worked.
  const mailed = email === null ? null : await emailLoginLinkFor({ affiliateId: id, appOrigin: serverEnv().APP_ORIGIN });
  if (mailed?.kind === "emailed") {
    await recordStaffAction(staff, { businessId: null, kind: "affiliate.login_link_emailed", summary: "Emailed an affiliate their sign-in link", data: { affiliateId: id } });
  }
  redirect(mailed === null ? `/affiliates/${id}` : `/affiliates/${id}?mail=${mailed.kind === "emailed" ? "sent" : "failed"}`);
}
