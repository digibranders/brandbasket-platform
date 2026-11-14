"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { StatusChip } from "@brandbasket/shared/ui/patterns";
import { Banner, Button, Icon } from "@/ui";
import { ConfirmPaymentDialog, useConfirmPayment } from "../../checkout/components/confirm-payment";
import { useOpeningPayment } from "../../checkout/rules/opening-payment";
import { reactivateAction } from "../actions";
import type { ReactivationCardView } from "../loader";

/*
 * Plan & billing for a lapsed plan, ported from apps/platform components/panel/billing/reactivate-plan.tsx and
 * service-picker.tsx: what restarting costs a month and the one button that does it. A customer who cancelled themselves
 * chooses their services first; each choice is a link (`?services=`), so the price shown is always the one charged. The
 * button is held from the press until the payment opens, so a double press opens one payment.
 */
export function ReactivateCard({ view, canManage }: { readonly view: ReactivationCardView; readonly canManage: boolean }) {
  const formId = useId();
  const [state, action, pending] = useActionState(reactivateAction, null);
  const opening = useOpeningPayment(pending, state);
  const confirm = useConfirmPayment(state, pending);
  const failure = state !== null && !state.ok && !pending ? state : null;
  return (
    <article className="relative flex flex-col rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Your plan has ended</h2>
        <StatusChip label="Plan ended" variant="waiting" />
      </div>
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink-3">Your website and content are safe. Reactivate to bring them back from today. The months you were away aren’t charged.</p>
        {view.picker === null ? null : (
          <div className="flex flex-col gap-2 rounded-control border border-border bg-canvas p-4">
            <h3 className="type-sub font-semibold text-ink">Choose your services</h3>
            <ul className="flex flex-col gap-1">
              {view.picker.map((item) => (
                <li key={item.addOn}>
                  <Link href={item.href} replace scroll={false} className="flex items-center gap-2 py-1.5 no-underline">
                    <Icon name={item.selected ? "CheckCircle" : "Circle"} size="sm" className={item.selected ? "text-accent-gold" : "text-ink-muted"} />
                    <span className="flex-1 text-ink font-sans text-sm">
                      <span className="sr-only">{item.selected ? "Chosen: " : "Not chosen: "}</span>
                      {item.name}
                    </span>
                    <span className="tabular-nums font-mono text-sm text-ink-2">{item.price}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="type-meta font-mono">
          {view.planName}: {view.monthlyAmount} {view.per}.
        </p>
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        {canManage ? (
          <form id={formId} action={action}>
            {view.chosen?.map((service) => <input key={service} type="hidden" name="service" value={service} />)}
            <Button variant="primary" size="lg" pending={opening} onClick={confirm.ask}>
              {`Reactivate for ${view.monthlyAmount}`}
            </Button>
            <ConfirmPaymentDialog
              summary={view.summary}
              open={confirm.open}
              onClose={confirm.close}
              confirm={
                <Button type="submit" form={formId} variant="primary" pending={opening}>
                  {`Pay ${view.monthlyAmount}`}
                </Button>
              }
            />
          </form>
        ) : null}
      </div>
    </article>
  );
}
