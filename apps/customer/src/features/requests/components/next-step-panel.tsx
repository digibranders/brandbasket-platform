"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NextStep } from "@/components";
import { ConfirmPaymentDialog, useConfirmPayment } from "@/features/checkout/components/confirm-payment";
import type { PaymentSummary } from "@/features/checkout/rules/payment-summary";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button, LinkButton } from "@/ui";
import { acceptQuoteAction, approveChangeAction, declineQuoteAction, reopenRequestAction } from "../actions";
import { chargePath, type RequestNextStep } from "../rules";

export interface NextStepPanelProps {
  readonly step: RequestNextStep;
  /** The change request's id, which the moves name. */
  readonly requestId: string | null;
  /** Viewers see the sentence and no button. */
  readonly canAct: boolean;
}

/** What happens next, with the one button that moves it and a second for Not now or Reopen. */
export function NextStepPanel({ step, requestId, canAct }: NextStepPanelProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const { action, secondary, quote } = step;
  // Accepting a quote, or paying one, first shows what is paid: the quote's line and total, and its GST.
  const summary: PaymentSummary | null =
    quote === null
      ? null
      : { title: "Pay for this change", rows: [{ key: "quote", label: quote.line, amount: quote.total, tone: "plain" }], totalLabel: "Due today", total: quote.total, notes: step.note === null ? [] : [step.note] };
  const confirm = useConfirmPayment(message, pending);

  const run = (work: (formData: FormData) => Promise<ActionResult<{ href: string } | undefined>>) => {
    if (requestId === null) return;
    const formData = new FormData();
    formData.set("requestId", requestId);
    setMessage(null);
    start(async () => {
      const result = await work(formData);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      if (result.data?.href !== undefined) router.push(result.data.href);
      else router.refresh();
    });
  };

  const buttons = !canAct ? null : (
    <>
      {action?.kind === "accept" ? (
        <Button variant="primary" pending={pending} onClick={summary === null ? () => run(acceptQuoteAction) : confirm.ask}>
          {action.label}
        </Button>
      ) : null}
      {action?.kind === "pay" ? (
        summary === null ? (
          <LinkButton href={chargePath(action.chargeId)} variant="primary">
            {action.label}
          </LinkButton>
        ) : (
          <Button variant="primary" onClick={confirm.ask}>
            {action.label}
          </Button>
        )
      ) : null}
      {action?.kind === "approve" ? (
        <Button variant="primary" pending={pending} onClick={() => run(approveChangeAction)}>
          {action.label}
        </Button>
      ) : null}
      {secondary === null ? null : (
        <Button pending={pending} onClick={() => run(secondary.kind === "decline" ? declineQuoteAction : reopenRequestAction)}>
          {secondary.label}
        </Button>
      )}
    </>
  );

  const confirmButton =
    action?.kind === "accept" ? (
      <Button variant="primary" pending={pending} onClick={() => run(acceptQuoteAction)}>
        {action.label}
      </Button>
    ) : action?.kind === "pay" ? (
      <LinkButton href={chargePath(action.chargeId)} variant="primary">
        {action.label}
      </LinkButton>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
      {summary === null || confirmButton === null ? null : <ConfirmPaymentDialog summary={summary} open={confirm.open} onClose={confirm.close} confirm={confirmButton} />}
      <NextStep
        title={step.title}
        icon={quote === null ? undefined : "Receipt"}
        actions={buttons}
        note={canAct ? (step.note ?? undefined) : undefined}
      >
        {step.text}
        {quote === null ? null : (
          <span className="mt-2 flex justify-between gap-3 border-t border-accent-border pt-2">
            <span>{quote.line}</span>
            <strong className="font-semibold text-ink">{quote.total}</strong>
          </span>
        )}
      </NextStep>
    </div>
  );
}
