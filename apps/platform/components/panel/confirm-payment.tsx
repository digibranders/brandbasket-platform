"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { useDialogOpen } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { SOFT_BUTTON } from "@/components/v2/classes";
import type { PaymentSummary } from "@/lib/billing/payment-summary";

/** The lines, the total and what follows: the body of every payment confirmation. */
export function PaymentSummaryBody({ summary }: { readonly summary: PaymentSummary }): ReactElement {
  return (
    <div className="grid gap-3">
      {summary.rows.length === 0 ? null : (
        <ul className="grid">
          {summary.rows.map((row) => (
            <li key={row.key} className="flex justify-between gap-4 py-1 text-[0.9375rem] text-ink-2">
              <span className={row.tone === "save" ? "text-ok" : undefined}>{row.label}</span>
              <span className={`${row.tone === "free" ? "" : "tabular-nums"} ${row.tone === "plain" ? "" : "text-ok"}`}>{row.amount}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <span className="text-[0.9375rem] font-semibold text-ink">{summary.totalLabel}</span>
        <span className="font-display text-2xl font-semibold tabular-nums text-ink">{summary.total}</span>
      </div>
      {summary.notes.map((note) => (
        <p key={note} className="text-[0.84375rem] text-ink-2">
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
  /** The button that pays: a submit for the payment's form (`form={formId}`), or one that runs it. */
  readonly confirm: ReactNode;
  readonly failure?: string | null;
  /** True while the payment opens: Escape, the backdrop and Go back then do nothing, so the press cannot be undone half way. */
  readonly busy?: boolean;
}

/** Shown when a payment button is pressed: what is paid for and what is taken, with Go back and the button that pays. */
export function ConfirmPaymentDialog({ summary, open, onClose, confirm, failure = null, busy = false }: ConfirmPaymentDialogProps): ReactElement {
  const dialog = useDialogOpen(open);
  const titleId = useId();
  return (
    // A click on the dimmed background lands on the dialog itself; Escape is the dialog's own cancel.
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),35rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="font-display text-[1.0625rem] font-semibold text-ink">
            {summary.title}
          </h3>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {failure === null ? null : (
          <p role="alert" className="rounded-lg bg-error-wash px-3 py-2 text-[0.84375rem] text-error">
            {failure}
          </p>
        )}
        <PaymentSummaryBody summary={summary} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={SOFT_BUTTON}>
            Go back
          </button>
          {confirm}
        </div>
      </div>
    </dialog>
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
