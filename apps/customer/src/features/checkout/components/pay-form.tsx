"use client";

import { useActionState, useState } from "react";
import { Banner, Button } from "@/ui";
import { startPaymentAction } from "../actions";
import type { BillingDetailsView } from "../rules/billing-details-view";
import { useOpeningPayment } from "../rules/opening-payment";
import { BillingFieldset } from "./billing-fieldset";

/*
 * The Pay form, ported from apps/platform components/panel/membership/checkout-ledger.tsx and checkout-billing.tsx. A business
 * billed in rupees pays through the form that also takes its billing details: with none saved the fields are open and Pay saves
 * them; with details saved a line says who the invoice goes to, and Change opens the fields again. The button is held from
 * the press until a refusal comes back, so a second press cannot open a second payment. A refused billing field
 * is shown under its input, and the message above the button.
 */

interface PayFormProps {
  readonly services: readonly string[];
  /** How often the basket is paid for, as the address says it: "monthly" or "yearly". */
  readonly billing: string;
  readonly total: string;
  readonly billingDetails: BillingDetailsView | null;
}

export function PayForm({ services, billing, total, billingDetails }: PayFormProps) {
  const [state, action, pending] = useActionState(startPaymentAction, null);
  const opening = useOpeningPayment(pending, state);
  const [changing, setChanging] = useState(false);
  const failure = state !== null && !state.ok && !pending ? state : null;
  const saved = billingDetails?.saved ?? null;
  const showFields = billingDetails !== null && (saved === null || changing);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="tier" value="managed" />
      <input type="hidden" name="billing" value={billing} />
      {services.map((service) => (
        <input key={service} type="hidden" name="service" value={service} />
      ))}
      {billingDetails === null ? null : (
        <section aria-labelledby="checkout-billing" className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <h3 id="checkout-billing" className="type-sub text-ink">
            Billing details
          </h3>
          {showFields ? (
            <>
              <p className="type-body text-ink-3">Your GST invoice is made out from these details. It cannot be changed once it is issued.</p>
              <BillingFieldset view={billingDetails} errors={failure?.fieldErrors} />
            </>
          ) : saved === null ? null : (
            <div className="flex flex-col items-start gap-1">
              <p className="type-body text-ink-3">
                Your GST invoice goes to <span className="text-ink">{saved.legalName}</span>
                {saved.gstin === null ? "" : `, GSTIN ${saved.gstin}`}.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
                Change billing details
              </Button>
            </div>
          )}
        </section>
      )}
      {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
      <Button type="submit" variant="primary" size="lg" pending={opening}>
        {opening ? "Opening payment…" : `Pay ${total}`}
      </Button>
    </form>
  );
}
