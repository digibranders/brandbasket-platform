"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NextActionCard } from "@brandbasket/shared/ui/patterns";
import { ConfirmPaymentDialog, useConfirmPayment } from "@/features/checkout/components/confirm-payment";
import type { PaymentSummary } from "@/features/checkout/rules/payment-summary";
import type { ActionResult } from "@/lib/action-result";
import { ASK_OWNER } from "@/lib/ask-owner";
import { Banner, Button, Icon, LinkButton } from "@/ui";
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

  const quoteLine =
    quote === null ? null : (
      <div className="flex justify-between gap-3 border-t border-border pt-3 type-body">
        <span>{quote.line}</span>
        <strong className="font-mono font-semibold tabular-nums text-ink">{quote.total}</strong>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
      {summary === null || confirmButton === null ? null : <ConfirmPaymentDialog summary={summary} open={confirm.open} onClose={confirm.close} confirm={confirmButton} />}
      {action === null ? (
        <section className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-5 shadow-card">
          <h2 className="flex items-center gap-2 type-sub text-ink">
            <Icon name="ChatCircleDots" className="text-ink-3" />
            {step.title}
          </h2>
          <p className="type-body text-ink-2">{step.text}</p>
          {buttons === null || secondary === null ? null : <div className="flex flex-wrap items-center gap-2">{buttons}</div>}
        </section>
      ) : (
        <NextActionCard
          serviceName={quote === null ? "Your request" : "Quote"}
          serviceIcon={<Icon name={quote === null ? "ChatCircleDots" : "Receipt"} />}
          title={step.title}
          description={step.text}
          secondaryAction={buttons}
          asideNote={canAct ? (step.note ?? undefined) : ASK_OWNER}
        >
          {quoteLine}
        </NextActionCard>
      )}
    </div>
  );
}
