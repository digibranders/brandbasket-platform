/**
 * What recording a manual payment did. Lives here, beside the messages that describe each case, rather than
 * with the server code that produces it: the vocabulary is a domain concept both the app and the admin share,
 * and a shared package must not reach into one app's server modules.
 */
export type ManualPaymentOutcome =
  | { readonly kind: "recorded" }
  /** The business is already inside a paid period: there is nothing to record. */
  | { readonly kind: "already-paid" }
  /** The business's currency has no active plan, so there is no price to record. */
  | { readonly kind: "no-plan" };
import type { ManualPaymentFormProblem } from "./manual-payment-form";

/** What the client page says after an admin records a manual payment or resolves a flagged one. */
export type ManualPaymentNotice =
  | ManualPaymentOutcome["kind"]
  | ManualPaymentFormProblem
  | "attention-resolved"
  | "attention-unchanged";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const MANUAL_PAYMENT_NOTICES: Readonly<Record<ManualPaymentNotice, { readonly text: string; readonly ok: boolean }>> = {
  recorded: { text: "Payment recorded.", ok: true },
  "already-paid": { text: "Nothing recorded: this business has already paid.", ok: false },
  "no-plan": { text: "Nothing recorded: there is no active plan for this business’s currency.", ok: false },
  unconfirmed: { text: "Nothing recorded: tick the box to confirm the money has arrived.", ok: false },
  "missing-reference": {
    text: "Nothing recorded: give the bank or payment reference (up to 100 characters).",
    ok: false,
  },
  "invalid-date": {
    text: "Nothing recorded: the date received must be a real date within the last year, and not in the future.",
    ok: false,
  },
  "attention-resolved": { text: "Marked as sorted. It no longer shows as needing attention.", ok: true },
  "attention-unchanged": { text: "Nothing changed: that payment was already sorted.", ok: false },
};

export function manualPaymentNoticeHref(businessId: string, notice: ManualPaymentNotice): string {
  return `/clients/${businessId}?payment=${notice}`;
}

export function readManualPaymentNotice(value: string | string[] | undefined): ManualPaymentNotice | null {
  return typeof value === "string" && Object.hasOwn(MANUAL_PAYMENT_NOTICES, value)
    ? (value as ManualPaymentNotice)
    : null;
}
