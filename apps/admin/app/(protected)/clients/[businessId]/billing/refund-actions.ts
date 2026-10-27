"use server";

import { markPaymentRefunded } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRefundForm, refundNoticeHref } from "@/lib/refund-form";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";

/**
 * Marks a payment refunded after finance gave the money back in Razorpay or by bank. Moves no money (owner decision 2).
 * Finance and admin only; the database refuses anything but a paid payment, and an amount above it.
 */
export async function markPaymentRefundedAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("money");
  const parsed = parseRefundForm(formData);
  if (!parsed.ok) redirect(refundNoticeHref(parsed.businessId, parsed.notice));
  const { value } = parsed;

  const outcome = await markPaymentRefunded(getStaffDb(), { ...value, staffUserId: granted.user.id, now: new Date() });
  if (outcome.kind !== "marked") redirect(refundNoticeHref(value.businessId, outcome.kind));

  await recordStaffAction(granted, {
    businessId: value.businessId,
    kind: "payment.marked_refunded",
    summary: "Marked a payment refunded",
    data: {
      paymentId: value.paymentId,
      refundedAmountCents: value.refundedAmountCents,
      reason: value.reason,
      cancelledEarnings: outcome.cancelledEarnings,
      paidEarnings: outcome.paidEarnings,
    },
  });
  revalidatePath(`/clients/${value.businessId}/billing`);
  revalidatePath("/payments");
  redirect(refundNoticeHref(value.businessId, outcome.paidEarnings > 0 ? "marked-paid-earning" : "marked"));
}
