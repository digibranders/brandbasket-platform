import { parseMoney } from "@brandbasket/shared/lib/money";
import { z } from "zod";

export const REFUND_NOTICES = [
  "marked",
  "marked-paid-earning",
  "invalid-amount",
  "invalid-reason",
  "unconfirmed",
  "not-refundable",
  "amount-too-high",
] as const;
export type RefundNotice = (typeof REFUND_NOTICES)[number];

export const REFUND_NOTICE_TEXT: Readonly<Record<RefundNotice, { readonly tone: "ok" | "problem"; readonly text: string }>> = {
  marked: { tone: "ok", text: "Marked refunded. Any affiliate earning still owed for it was cancelled." },
  "marked-paid-earning": {
    tone: "ok",
    text: "Marked refunded. The affiliate was already paid for this payment: take it off their next payout by hand.",
  },
  "invalid-amount": { tone: "problem", text: "Enter the amount given back, like 2999 or 2,999.00." },
  "invalid-reason": { tone: "problem", text: "Say why it was refunded, in 3 to 300 characters." },
  unconfirmed: { tone: "problem", text: "Tick the box to confirm the money was already given back." },
  "not-refundable": { tone: "problem", text: "Only a paid payment can be marked refunded. It may have been marked already." },
  "amount-too-high": { tone: "problem", text: "The amount given back cannot be more than the payment." },
};

export interface RefundFormValue {
  readonly paymentId: string;
  readonly businessId: string;
  readonly refundedAmountCents: number;
  readonly reason: string;
}

export type RefundFormResult =
  | { readonly ok: true; readonly value: RefundFormValue }
  | { readonly ok: false; readonly businessId: string; readonly notice: RefundNotice };

const uuid = z.uuid();

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Reads the Mark refunded form. The business comes from the page itself, so a form without one is a bug, not a typo. */
export function parseRefundForm(formData: FormData): RefundFormResult {
  const businessId = text(formData.get("businessId"));
  if (!uuid.safeParse(businessId).success) throw new Error("The refund form has no business");
  const paymentId = text(formData.get("paymentId"));
  if (!uuid.safeParse(paymentId).success) return { ok: false, businessId, notice: "not-refundable" };
  const amount = parseMoney(text(formData.get("amount")));
  if (amount === null || amount < 1) return { ok: false, businessId, notice: "invalid-amount" };
  const reason = text(formData.get("reason")).trim();
  if (reason.length < 3 || reason.length > 300) return { ok: false, businessId, notice: "invalid-reason" };
  if (formData.get("confirm") !== "yes") return { ok: false, businessId, notice: "unconfirmed" };
  return { ok: true, value: { paymentId, businessId, refundedAmountCents: amount, reason } };
}

export function refundNoticeHref(businessId: string, notice: RefundNotice): string {
  return `/clients/${businessId}/billing?refund=${notice}#payments`;
}

export function readRefundNotice(param: string | readonly string[] | undefined): RefundNotice | null {
  return typeof param === "string" && (REFUND_NOTICES as readonly string[]).includes(param) ? (param as RefundNotice) : null;
}
