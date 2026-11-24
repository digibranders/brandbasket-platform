"use client";

import { useState, type ReactElement } from "react";
import { formatMoney, parseMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { buttonSmall } from "@/components/console/buttons";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { refundPreview, REFUND_STAYS_ACTIVE_LINE } from "@/lib/refund-preview";

interface RefundDialogProps {
  readonly businessId: string;
  readonly paymentId: string;
  readonly businessName: string;
  readonly currency: MoneyCurrency;
  readonly amountCents: number;
  /** The whole payment as the amount field shows it, such as "2999.00". */
  readonly fullAmount: string;
  readonly invoiceNumber: string | null;
  /** refundPaymentAction: calls the payment provider, marks refunded, issues the credit note and emails the customer. */
  readonly action: (formData: FormData) => Promise<void>;
}

/** The primary refund: full or partial, with the consequence, the credit note and the customer's email shown before it is confirmed. */
export function RefundDialog({ businessId, paymentId, businessName, currency, amountCents, fullAmount, invoiceNumber, action }: RefundDialogProps): ReactElement {
  const [partial, setPartial] = useState(false);
  const [typed, setTyped] = useState(fullAmount);
  const [reason, setReason] = useState("");
  const refundCents = partial ? parseMoney(typed) : amountCents;
  const preview = refundCents === null ? null : refundPreview({ currency, paymentCents: amountCents, refundCents, reason, invoiceNumber });
  const shownAmount = preview === null ? "this payment" : formatMoney(refundCents ?? amountCents, currency);

  return (
    <ConfirmDialog
      title={preview === null ? `Refund ${businessName}` : `Confirm refund of ${shownAmount} for ${businessName}`}
      consequence={preview?.consequence ?? `Enter an amount above zero and no more than ${formatMoney(amountCents, currency)}.`}
      triggerLabel="Refund"
      triggerClassName={buttonSmall}
      confirmLabel={preview === null ? "Process refund" : `Process refund of ${shownAmount}`}
      cancelLabel="Cancel"
      formAction={action}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="mb-5 grid gap-4">
        <fieldset>
          <legend className={labelClasses}>How much</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                value="full"
                checked={!partial}
                onChange={() => {
                  setPartial(false);
                  setTyped(fullAmount);
                }}
                className={checkboxClasses}
              />
              Full refund
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" value="partial" checked={partial} onChange={() => setPartial(true)} className={checkboxClasses} />
              Part of it
            </label>
          </div>
        </fieldset>
        <label className={labelClasses}>
          Amount to refund ({currency})
          <input
            name="amount"
            required
            inputMode="decimal"
            value={typed}
            readOnly={!partial}
            onChange={(event) => setTyped(event.target.value)}
            className={fieldClasses}
          />
        </label>
        <label className={labelClasses}>
          Why it was refunded
          <textarea name="reason" required minLength={3} maxLength={300} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClasses} />
          <span className={hintClasses}>The customer sees this in the email.</span>
        </label>
      </div>

      {preview === null ? null : (
        <div className="grid gap-3 rounded-[14px] bg-sunken p-4 text-sm" aria-live="polite">
          <p>
            <span className="font-semibold">Credit note.</span> {preview.creditNote}
          </p>
          <div>
            <p className="font-semibold">What the customer is emailed</p>
            <div className="mt-2 rounded-[8px] bg-surface p-3">
              <p className="font-semibold">{preview.subject}</p>
              {preview.emailLines.map((line) => (
                <p key={line} className="mt-2 text-ink-2">
                  {line}
                </p>
              ))}
            </div>
          </div>
          <p className="text-ink-2">{REFUND_STAYS_ACTIVE_LINE}</p>
        </div>
      )}
    </ConfirmDialog>
  );
}

interface ManualRefundDialogProps {
  readonly businessId: string;
  readonly paymentId: string;
  readonly currency: MoneyCurrency;
  readonly fullAmount: string;
  /** markPaymentRefundedAction: marks the payment refunded and moves no money. */
  readonly action: (formData: FormData) => Promise<void>;
}

/** The secondary path: money already given back in Razorpay or by bank transfer, so the console only records it. */
export function ManualRefundDialog({ businessId, paymentId, currency, fullAmount, action }: ManualRefundDialogProps): ReactElement {
  return (
    <ConfirmDialog
      title="Record a refund made outside BrandBasket"
      consequence="The payment is marked refunded and any affiliate earning still owed for it is cancelled. No money moves and the customer is not emailed. This cannot be undone."
      triggerLabel="Record a refund made outside BrandBasket"
      triggerClassName="cursor-pointer text-xs text-ink-2 hover:underline"
      confirmLabel="Record manual refund"
      cancelLabel="Cancel"
      formAction={action}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="mb-5 grid gap-4">
        <label className={labelClasses}>
          Amount given back ({currency})
          <input name="amount" required inputMode="decimal" defaultValue={fullAmount} className={fieldClasses} />
        </label>
        <label className={labelClasses}>
          Why it was refunded
          <textarea name="reason" required minLength={3} maxLength={300} rows={2} className={fieldClasses} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acknowledged" value="yes" required className={checkboxClasses} />
          <span>I have already given this money back in Razorpay or by bank transfer. The console moves no money.</span>
        </label>
      </div>
    </ConfirmDialog>
  );
}
