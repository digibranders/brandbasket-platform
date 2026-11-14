"use server";

import { markPaymentRefunded } from "@brandbasket/db";
import { executePaymentRefund } from "@brandbasket/shared/server/payment-refund";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRefundForm, refundNoticeHref } from "@/lib/refund-form";
import { recordStaffAction } from "@/lib/server/activity";
import { getBillingProvider } from "@/lib/server/billing-provider";
import { getStaffDb } from "@/lib/server/db";
import { sendPaymentRefunded } from "@/lib/server/payment-emails";
import { requireStaffCan } from "@/lib/server/staff-role";

/**
 * Refunds a payment through the payment provider (Razorpay in production, fake provider in dev/test),
 * marks the payment refunded, issues a GST credit note linked to the invoice, emails the customer,
 * and records the staff action in the audit log.
 *
 * If the provider call fails, nothing is marked in the database and an error notice is displayed.
 * Double press is serialized and idempotent: pressing twice will only refund once.
 */
export async function refundPaymentAction(formData: FormData): Promise<void> {
  const granted = await requireStaffCan("money");
  const parsed = parseRefundForm(formData);
  if (!parsed.ok) redirect(refundNoticeHref(parsed.businessId, parsed.notice));
  const { value } = parsed;

  const provider = getBillingProvider();
  const outcome = await executePaymentRefund(getStaffDb(), provider, {
    ...value,
    staffUserId: granted.user.id,
    now: new Date(),
  });

  if (outcome.kind !== "refunded") {
    redirect(refundNoticeHref(value.businessId, outcome.kind));
  }

  await sendPaymentRefunded({
    paymentId: value.paymentId,
    refundedAmountCents: value.refundedAmountCents,
    reason: value.reason,
    creditNoteNumber: outcome.creditNote?.number ?? null,
  });

  await recordStaffAction(granted, {
    businessId: value.businessId,
    kind: "payment.refunded",
    summary: "Refunded a payment via provider",
    data: {
      paymentId: value.paymentId,
      refundedAmountCents: value.refundedAmountCents,
      reason: value.reason,
      providerRefundId: outcome.providerRefundId,
      creditNoteNumber: outcome.creditNote?.number ?? null,
      cancelledEarnings: outcome.cancelledEarnings,
      paidEarnings: outcome.paidEarnings,
    },
  });

  revalidatePath(`/clients/${value.businessId}/billing`);
  revalidatePath("/payments");
  redirect(refundNoticeHref(value.businessId, outcome.paidEarnings > 0 ? "refunded-paid-earning" : "refunded"));
}

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
