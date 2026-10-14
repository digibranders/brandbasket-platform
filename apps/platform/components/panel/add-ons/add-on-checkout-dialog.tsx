"use client";

import Link from "next/link";
import { useActionState, useId, useRef, type ReactElement } from "react";
import type { AddOnId, AddOnPrice } from "@firstfold/shared/lib/billing/add-ons";
import type { AddOnCheckoutIntent } from "@firstfold/shared/lib/billing/add-on-state";
import { formatRupees } from "@firstfold/shared/lib/directory/ads";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { BillingDetailsPrompt } from "@/components/panel/billing/billing-details-prompt";
import { initialAddOnStartState, type AddOnInvoiceNote, type AddOnStartState } from "@/lib/billing/add-on-form";
import { checkoutPendingLabel, type CheckoutCopy } from "@/lib/billing/add-on-copy";

interface AddOnCheckoutDialogProps {
  readonly addOnId: AddOnId;
  readonly title: string;
  /** What the add-on does, in one line. */
  readonly line: string;
  readonly intent: AddOnCheckoutIntent;
  /** The opening button: "Get it", "Resume", "Pay now" or "Keep it". */
  readonly triggerText: string;
  /** The opening button's full accessible name, which names the add-on. */
  readonly triggerLabel: string;
  /** What this purchase costs, worked out on the server. The browser only formats it. */
  readonly price: AddOnPrice;
  /** The Premium discount's whole percent, for the line that explains it. */
  readonly discountPercent: number;
  readonly copy: CheckoutCopy;
  readonly invoice: AddOnInvoiceNote;
  /** Opens the payment, or hands back why not. A press release ignores the form. */
  readonly action: (previous: AddOnStartState, formData: FormData) => Promise<AddOnStartState>;
}

function PriceRow({ label, amount, strong }: { readonly label: string; readonly amount: string; readonly strong?: boolean }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={strong === true ? "font-medium text-ink" : "text-ink-soft"}>{label}</dt>
      <dd className={strong === true ? "font-serif text-2xl tabular-nums text-ink" : "tabular-nums text-ink"}>{amount}</dd>
    </div>
  );
}

function InvoiceLine({ invoice }: { readonly invoice: AddOnInvoiceNote }): ReactElement | null {
  switch (invoice.kind) {
    case "none":
      return null;
    case "missing":
      return <BillingDetailsPrompt />;
    case "saved":
      return (
        <p className="text-sm leading-relaxed text-ink-soft">
          The GST invoice is made out to {invoice.legalName}
          {invoice.gstin === null ? "" : `, GSTIN ${invoice.gstin}`}.{" "}
          <Link href="/billing#billing-details" className="link-underline text-ink">
            Change billing details
          </Link>
        </p>
      );
    default: {
      const unhandled: never = invoice;
      throw new Error(`Unhandled invoice note ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * The button that starts buying an add-on, and the purchase details it opens: what the add-on is, the price built up
 * line by line, what happens after paying, and who the invoice is for. A native dialog (the image cropper's pattern):
 * showModal traps focus and Escape closes it. Checkout posts to the server action, which opens the payment, so nothing
 * is charged by opening this. Opening it puts focus on the heading so the title is read first; while the payment opens the
 * Checkout button's accessible name says so. The amounts arrive from the server; the browser never works a price out.
 */
export function AddOnCheckoutDialog({
  addOnId,
  title,
  line,
  intent,
  triggerText,
  triggerLabel,
  price,
  discountPercent,
  copy,
  invoice,
  action,
}: AddOnCheckoutDialogProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [state, formAction, isPending] = useActionState(action, initialAddOnStartState);
  const message = state.status === "error" && !isPending ? state.message : null;
  const gstCents = price.chargedCents - price.netCents;
  const pending = checkoutPendingLabel(title);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={() => {
          dialogRef.current?.showModal();
          // Without this the browser focuses the first link or button, and a screen reader reads that before the title.
          headingRef.current?.focus();
        }}
      >
        {triggerText}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),34rem)] overflow-y-auto rounded-card bg-card p-0 text-left text-ink shadow-[0_24px_80px_-20px_rgb(42_13_16/0.45)] backdrop:bg-ink/60"
      >
        <div className="p-6 sm:p-7">
          <h2 ref={headingRef} id={titleId} tabIndex={-1} className="font-serif text-2xl leading-tight outline-none">
            {copy.heading}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">{line}</p>
          {copy.lead === null ? null : <p className="mt-4 text-sm font-medium text-ink">{copy.lead}</p>}

          <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
            <PriceRow label={title} amount={formatRupees(price.listCents)} />
            {price.discountCents > 0 ? (
              <PriceRow label={`Premium member, ${discountPercent}% off`} amount={`−${formatRupees(price.discountCents)}`} />
            ) : null}
            <PriceRow label={`GST ${price.taxRateBasisPoints / 100}%`} amount={formatRupees(gstCents)} />
            <PriceRow label={copy.totalLabel} amount={formatRupees(price.chargedCents)} strong />
          </dl>

          <div className="mt-4 space-y-2 text-sm leading-relaxed text-ink-soft">
            {copy.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <div className="mt-4">
            <InvoiceLine invoice={invoice} />
          </div>

          <form action={formAction} className="mt-6">
            <input type="hidden" name="addOn" value={addOnId} />
            <input type="hidden" name="intent" value={intent} />
            {message === null ? null : (
              <p role="alert" className="mb-4 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
                {message}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SubmitButton size="sm" pendingLabel={pending.text} aria-label={isPending ? pending.ariaLabel : `Checkout for ${title}`}>
                Checkout
              </SubmitButton>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                disabled={isPending}
                aria-label={`Not now, close the ${title} details`}
                onClick={() => dialogRef.current?.close()}
              >
                Not now
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
