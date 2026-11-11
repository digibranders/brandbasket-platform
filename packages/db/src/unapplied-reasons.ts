import type { PaymentAttentionReason } from "./schema/billing";

/*
 * Pure and browser-safe: client code imports this subpath instead of the package index, which loads the pg driver.
 */

/** Attention reasons whose payment bought nothing. Such a payment never counts as the business having paid. */
export const UNAPPLIED_PAYMENT_REASONS = [
  "checkout_replaced",
  "already_paid",
  "amount_mismatch",
  "upgrade_not_applied",
  "add_on_not_applied",
] as const satisfies readonly PaymentAttentionReason[];

/** True for an attention reason whose payment bought nothing. */
export function isUnappliedReason(reason: PaymentAttentionReason | null): boolean {
  return reason !== null && (UNAPPLIED_PAYMENT_REASONS as readonly PaymentAttentionReason[]).includes(reason);
}
