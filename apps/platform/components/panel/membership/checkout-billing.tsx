"use client";

import { useRef, useState, type ReactElement } from "react";
import { BillingFieldset } from "@/components/panel/billing/billing-details-form";
import type { PanelFormControls } from "@/components/panel/form/panel-form";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";

interface CheckoutBillingProps {
  readonly view: BillingDetailsView;
  /** The Pay form's controls: a field the server refuses is shown under its input. */
  readonly controls: PanelFormControls;
}

/**
 * The billing details on the plan page, above Pay, inside the Pay form: a business billed in rupees cannot pay without them,
 * because its first tax invoice is made out from them and cannot be changed once issued. With none saved the fields are
 * open and Pay saves them; with details saved a line says who the invoice goes to, and Change opens the fields again.
 */
export function CheckoutBilling({ view, controls }: CheckoutBillingProps): ReactElement {
  const { saved } = view;
  const [changing, setChanging] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const showFields = saved === null || changing;

  return (
    <section aria-labelledby="checkout-billing" className="mt-5 border-t border-line pt-[1.125rem]">
      <h3 id="checkout-billing" ref={headingRef} tabIndex={-1} className="font-display text-[0.9375rem] font-semibold outline-none">
        Billing details
      </h3>
      {showFields ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">Your GST invoice is made out from these details. It cannot be changed once it is issued.</p>
          <div className="mt-4">
            <BillingFieldset controls={controls} view={view} layout="narrow" />
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
            Your GST invoice goes to <span className="text-ink">{saved.legalName}</span>
            {saved.gstin === null ? "" : `, GSTIN ${saved.gstin}`}.
          </p>
          <button
            type="button"
            onClick={() => {
              setChanging(true);
              // The button leaves the page as the fields arrive, so focus goes to the section instead of being lost.
              headingRef.current?.focus();
            }}
            className="mt-1 text-sm text-ink-2 underline decoration-line underline-offset-4 transition-colors duration-300 ease-calm hover:text-ink"
          >
            Change billing details
          </button>
        </>
      )}
    </section>
  );
}
