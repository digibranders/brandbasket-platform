import type { ReactNode } from "react";
import { Badge, LinkButton } from "@/ui";
import { PendingSubmit } from "./pending-submit";

/*
 * The fake provider's stand-in for Razorpay's window (development only), ported from apps/platform
 * app/app-host/billing/confirm/page.tsx and components/panel/test-checkout-form.tsx. Pay is disabled while it confirms, so a
 * double click sends one request.
 */

export function TestCheckout({ rows, note, action, cancelHref, submitLabel }: {
  readonly rows: readonly { readonly label: string; readonly value: ReactNode }[];
  readonly note: ReactNode;
  readonly action: () => Promise<void>;
  readonly cancelHref: string;
  readonly submitLabel: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-100 flex-col gap-4 py-12">
      <div className="flex flex-col items-start gap-2">
        <Badge tone="warn">Test checkout</Badge>
        <h1 className="type-title text-ink">Test payment</h1>
        <p className="type-body text-ink-3">Test payment. No money will move.</p>
      </div>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="type-body text-ink-3">{row.label}</dt>
            <dd className="type-sub text-right text-ink tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="type-body text-ink-3">{note}</p>
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <PendingSubmit>{submitLabel}</PendingSubmit>
        <LinkButton href={cancelHref}>Cancel</LinkButton>
      </form>
    </div>
  );
}

/** A checkout link that has expired or is not for this account: nothing was recorded. */
export function TestCheckoutRefused({ lede, children }: { readonly lede: string; readonly children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-100 flex-col gap-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="type-title text-ink">Payment not confirmed</h1>
        <p className="type-body text-ink-3">{lede}</p>
      </div>
      {children}
    </div>
  );
}
