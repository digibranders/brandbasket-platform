"use server";

import { redirect } from "next/navigation";
import type { AffiliateFormState } from "@/components/affiliate-forms";
import { submittedValues } from "@/lib/form-values";
import { createAffiliateFor } from "@/lib/server/affiliate-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";

/** Creates an affiliate; every rule is applied in createAffiliateFor, on the server. */
export async function createAffiliateAction(_previous: AffiliateFormState, formData: FormData): Promise<AffiliateFormState> {
  const { user } = await requireStaffAccess();
  const outcome = await createAffiliateFor({ formData, staffUserId: user.id });
  if (outcome.kind === "refused") {
    return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  }
  if (outcome.kind !== "saved") throw new Error(`Creating an affiliate answered ${outcome.kind}`);
  redirect(`/affiliates/${outcome.affiliate.id}`);
}
