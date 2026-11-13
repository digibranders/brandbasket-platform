"use client";

import { useState, type ReactNode } from "react";
import { Banner, Button, Dialog, DialogClose } from "@/ui";
import type { PaymentSummary } from "../rules/payment-summary";

/** The lines, the total and what follows: the body of every payment confirmation. */
export function PaymentSummaryBody({ summary }: { readonly summary: PaymentSummary }) {
  return (
    <div className="flex flex-col gap-3">
      {summary.rows.length === 0 ? null : (
        <ul className="flex flex-col">
          {summary.rows.map((row) => (
            <li key={row.key} className="flex justify-between gap-4 py-1 type-body text-ink-2">
              <span className={row.tone === "save" ? "text-pos-text" : undefined}>{row.label}</span>
              <span className={`${row.tone === "free" ? "" : "tabular-nums"} ${row.tone === "plain" ? "" : "text-pos-text"}`}>{row.amount}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between gap-4 border-t border-border-subtle pt-3">
        <span className="type-sub text-ink">{summary.totalLabel}</span>
        <span className="type-metric tabular-nums text-ink">{summary.total}</span>
      </div>
      {summary.notes.map((note) => (
        <p key={note} className="type-meta">
          {note}
        </p>
      ))}
    </div>
  );
}

interface ConfirmPaymentDialogProps {
  readonly summary: PaymentSummary;
  readonly open: boolean;
  readonly onClose: () => void;
  /** The button that pays: a submit for the payment's form, or one that runs it. */
  readonly confirm: ReactNode;
  readonly failure?: string | null;
}

/** Shown when a payment button is pressed: what is paid for and what is taken, with Go back and the button that pays. */
export function ConfirmPaymentDialog({ summary, open, onClose, confirm, failure = null }: ConfirmPaymentDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={summary.title}
      footer={
        <>
          <DialogClose>
            <Button>Go back</Button>
          </DialogClose>
          {confirm}
        </>
      }
    >
      {failure === null ? null : <Banner tone="neg">{failure}</Banner>}
      <PaymentSummaryBody summary={summary} />
    </Dialog>
  );
}

/**
 * Open from the press until the payment's action answers: a refusal closes it, so the message shows where the button was; a
 * payment that opens leaves the page with it still open and its button held. `result` is the action's last result.
 */
export function useConfirmPayment(result: unknown, pending: boolean): { readonly open: boolean; readonly ask: () => void; readonly close: () => void } {
  const [askedAt, setAskedAt] = useState<{ readonly result: unknown } | null>(null);
  return {
    open: askedAt !== null && (pending || askedAt.result === result),
    ask: () => setAskedAt({ result }),
    close: () => setAskedAt(null),
  };
}
