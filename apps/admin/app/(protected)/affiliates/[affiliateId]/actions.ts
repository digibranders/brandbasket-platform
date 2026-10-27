"use server";

import { revalidatePath } from "next/cache";
import type { AffiliateFormState } from "@/components/affiliate-forms";
import { submittedValues } from "@/lib/form-values";
import type { LoginLinkState } from "@/components/affiliate-login-link";
import { cancelEarningFor, issueLoginLinkFor, recordPayoutFor, updateAffiliateFor } from "@/lib/server/affiliate-admin";
import { serverEnv } from "@/lib/server/env";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffCan } from "@/lib/server/staff-role";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { BillingCurrency } from "@brandbasket/db";

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
  const staff = await requireStaffCan("money");
  const outcome = await updateAffiliateFor({ affiliateId, formData });
  if (outcome.kind === "refused") return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  await recordStaffAction(staff, { businessId: null, kind: "affiliate.updated", summary: "Saved an affiliate's details", data: { affiliateId } });
  refresh(affiliateId);
  return { status: "done", message: "Saved." };
}

export async function recordPayoutAction(
  affiliateId: string,
  currency: BillingCurrency,
  _previous: AffiliateFormState,
  formData: FormData,
): Promise<AffiliateFormState> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  formData.set("currency", currency);
  const outcome = await recordPayoutFor({ affiliateId, formData, staffUserId: user.id, now: new Date() });
  if (outcome.kind === "refused") {
    refresh(affiliateId);
    return { status: "error", ...outcome.refusal, values: submittedValues(formData) };
  }
  await recordStaffAction(staff, {
    businessId: null,
    kind: "affiliate.payout_recorded",
    summary: "Recorded an affiliate payout",
    data: { affiliateId, amountCents: outcome.kind === "paid" ? outcome.amountCents : null, currency },
  });
  refresh(affiliateId);
  const amount = outcome.kind === "paid" ? formatMoney(outcome.amountCents, currency) : "";
  return { status: "done", message: `Recorded ${amount} paid.` };
}

/** Cancels one owed earning. Nothing in the posted form is read: the earning comes from the page. */
export async function cancelEarningAction(affiliateId: string, earningId: string): Promise<AffiliateFormState> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const outcome = await cancelEarningFor({ affiliateId, earningId, staffUserId: user.id, now: new Date() });
  refresh(affiliateId);
  if (outcome.kind === "refused") return { status: "error", ...outcome.refusal, values: {} };
  await recordStaffAction(staff, { businessId: null, kind: "affiliate.earning_cancelled", summary: "Cancelled an affiliate earning", data: { affiliateId, earningId } });
  return { status: "done", message: "Cancelled." };
}

/**
 * Makes a fresh sign-in link for the affiliate and hands it back to be copied. Nothing in the posted form is read: the
 * affiliate comes from the page.
 */
export async function issueLoginLinkAction(affiliateId: string): Promise<LoginLinkState> {
  const staff = await requireStaffCan("money");
  const outcome = await issueLoginLinkFor({ affiliateId, appOrigin: serverEnv().APP_ORIGIN });
  refresh(affiliateId);
  if (outcome.kind === "refused") return { status: "error", message: outcome.refusal.message };
  await recordStaffAction(staff, { businessId: null, kind: "affiliate.login_link_issued", summary: "Made an affiliate sign-in link", data: { affiliateId } });
  return { status: "link", url: outcome.url, expiresAt: outcome.expiresAt.toISOString() };
}
