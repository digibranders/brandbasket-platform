"use server";

import { revalidatePath } from "next/cache";
import type { AffiliateFormState } from "@/components/affiliate-forms";
import { submittedValues } from "@/lib/form-values";
import type { LoginLinkState } from "@/components/affiliate-login-link";
import { cancelEarningFor, issueLoginLinkFor, recordPayoutFor, updateAffiliateFor } from "@/lib/server/affiliate-admin";
import { serverEnv } from "@/lib/server/env";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { formatMoney } from "@firstfold/shared/lib/money";
import type { BillingCurrency } from "@firstfold/db";

/**
 * The affiliate page's actions. `affiliateId` (and `earningId`) come from the page through a closure, which Next.js
 * encrypts, so the posted form cannot name a different affiliate or earning.
 */

function refresh(affiliateId: string): void {
  revalidatePath(`/affiliates/${affiliateId}`);
  revalidatePath("/affiliates");
}

export async function updateAffiliateAction(
  affiliateId: string,
  _previous: AffiliateFormState,
  formData: FormData,
): Promise<AffiliateFormState> {
  await requireStaffAccess();
  const outcome = await updateAffiliateFor({ affiliateId, formData });
  if (outcome.kind === "refused") return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  refresh(affiliateId);
  return { status: "done", message: "Saved." };
}

export async function recordPayoutAction(
  affiliateId: string,
  currency: BillingCurrency,
  _previous: AffiliateFormState,
  formData: FormData,
): Promise<AffiliateFormState> {
  const { user } = await requireStaffAccess();
  formData.set("currency", currency);
  const outcome = await recordPayoutFor({ affiliateId, formData, staffUserId: user.id, now: new Date() });
  if (outcome.kind === "refused") {
    refresh(affiliateId);
    return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  }
  refresh(affiliateId);
  const amount = outcome.kind === "paid" ? formatMoney(outcome.amountCents, currency) : "";
  return { status: "done", message: `Recorded ${amount} paid.` };
}

/** Cancels one owed earning. Nothing in the posted form is read: the earning comes from the page. */
export async function cancelEarningAction(affiliateId: string, earningId: string): Promise<AffiliateFormState> {
  const { user } = await requireStaffAccess();
  const outcome = await cancelEarningFor({ affiliateId, earningId, staffUserId: user.id, now: new Date() });
  refresh(affiliateId);
  if (outcome.kind === "refused") return { status: "error", ...outcome.refusal, values: {} };
  return { status: "done", message: "Cancelled." };
}

/**
 * Makes a fresh sign-in link for the affiliate and hands it back to be copied. Nothing in the posted form is read: the
 * affiliate comes from the page.
 */
export async function issueLoginLinkAction(affiliateId: string): Promise<LoginLinkState> {
  await requireStaffAccess();
  const outcome = await issueLoginLinkFor({ affiliateId, appOrigin: serverEnv().APP_ORIGIN });
  refresh(affiliateId);
  if (outcome.kind === "refused") return { status: "error", message: outcome.refusal.message };
  return { status: "link", url: outcome.url, expiresAt: outcome.expiresAt.toISOString() };
}
