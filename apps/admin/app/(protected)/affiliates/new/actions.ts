"use server";

import { redirect } from "next/navigation";
import type { AffiliateFormState } from "@/components/affiliate-forms";
import { submittedValues } from "@/lib/form-values";
import { createAffiliateFor } from "@/lib/server/affiliate-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { recordStaffAction } from "@/lib/server/activity";

/** Creates an affiliate; every rule is applied in createAffiliateFor, on the server. */
export async function createAffiliateAction(_previous: AffiliateFormState, formData: FormData): Promise<AffiliateFormState> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const outcome = await createAffiliateFor({ formData, staffUserId: user.id });
  if (outcome.kind === "refused") {
    return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  }
  if (outcome.kind !== "saved") throw new Error(`Creating an affiliate answered ${outcome.kind}`);
  await recordStaffAction(staff, { businessId: null, kind: "affiliate.created", summary: "Added an affiliate", data: { affiliateId: outcome.affiliate.id } });
  redirect(`/affiliates/${outcome.affiliate.id}`);
}
