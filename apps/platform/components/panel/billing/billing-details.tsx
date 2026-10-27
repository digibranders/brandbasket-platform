"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { SectionHeading, Surface } from "@brandbasket/shared/ui/panel/surface";
import { saveBillingDetailsAction } from "@/app/app-host/(protected)/billing/actions";
import { BillingDetailsForm, SAVED_TEXT } from "@/components/panel/billing/billing-details-form";
import type { PanelFormAction } from "@/components/panel/form/panel-form";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";

interface BillingDetailsProps {
  readonly view: BillingDetailsView;
  /**
   * "card" on Billing; "checkout" above a pay button, where the optional form starts folded away; "ledger" is "checkout"
   * without its own heading, for a page that already titles it (the plan page's disclosure).
   */
  readonly variant: "card" | "checkout" | "ledger";
}

/**
 * The billing details for GST invoices: what is saved, and the form to add or change them. Open on the form until
 * details are saved; after a save the form closes, the facts show what was saved, and one line says what the save
 * changes. Edit opens the form again. On a checkout page the form is not in the way of paying: details are optional.
 */
export function BillingDetails({ view, variant }: BillingDetailsProps): ReactElement {
  const { saved } = view;
  const inCheckout = variant !== "card";
  // On a checkout page the optional form starts folded away, so the way to pay is not buried under it.
  const [editing, setEditing] = useState(saved === null && !inCheckout);
  const [justSaved, setJustSaved] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // Saving closes the form, which removes the Save button that had focus. Focus goes to the line that says it saved,
  // so a keyboard or screen reader user lands on the result instead of at the top of the page.
  useEffect(() => {
    if (justSaved) statusRef.current?.focus();
  }, [justSaved]);
  const saveAndClose: PanelFormAction = async (previous, formData) => {
    const next = await saveBillingDetailsAction(previous, formData);
    if (next.status === "saved") {
      setJustSaved(true);
      setEditing(false);
    }
    return next;
  };

  const facts =
    saved === null ? null : !inCheckout ? (
      <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <Fact label="Billed to" value={saved.legalName} />
        <Fact label="GSTIN" value={saved.gstin ?? "Not given"} />
        <Fact label="Address" value={saved.address} />
        <Fact label="State" value={stateName(saved.stateCode) ?? saved.stateCode} />
      </dl>
    ) : (
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Your GST invoice goes to <span className="text-ink">{saved.legalName}</span>
        {saved.gstin === null ? "" : `, GSTIN ${saved.gstin}`}.
      </p>
    );

  const foldedAway = saved === null && inCheckout && !editing;

  const intro =
    saved === null && !foldedAway ? (
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        {!inCheckout
          ? "Add your billing address, and your GSTIN if you have one, to get GST invoices in the right name. They apply to invoices issued after you save them."
          : "Optional. Add your billing address, and your GSTIN if you have one, for your GST invoice. You can pay without it."}
      </p>
    ) : null;

  const body = (
    <>
      {intro}
      {facts}
      {/* The region is always in the page, so a screen reader is watching it when the line arrives. */}
      <div role="status" aria-live="polite">
        {justSaved ? (
          <p ref={statusRef} tabIndex={-1} className="mt-4 text-sm text-ink-soft outline-none">
            {SAVED_TEXT}
          </p>
        ) : null}
      </div>
      {saved === null && inCheckout ? (
        // The same control opens and folds the form: pressing it again puts the form away.
        <button
          type="button"
          aria-expanded={editing}
          aria-controls="billing-details-form"
          onClick={() => setEditing(!editing)}
          className="mt-1 text-sm text-ink-soft underline decoration-line underline-offset-4 transition-colors duration-300 ease-calm hover:text-ink"
        >
          {editing ? "Hide GST billing details" : "Add your GST billing details (optional)"}
        </button>
      ) : null}
      {saved === null ? null : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-5"
          aria-expanded={editing}
          aria-controls="billing-details-form"
          onClick={() => {
            setJustSaved(false);
            setEditing(!editing);
          }}
        >
          {editing ? "Close" : "Edit billing details"}
        </Button>
      )}
      {editing ? (
        <div id="billing-details-form" className={saved === null ? "mt-4" : "mt-6 border-t border-line pt-6"}>
          <BillingDetailsForm view={view} action={saveAndClose} layout={inCheckout ? "narrow" : "wide"} />
        </div>
      ) : null}
    </>
  );

  if (variant === "card") {
    return (
      <Surface labelledBy="billing-details">
        <SectionHeading id="billing-details">Billing details</SectionHeading>
        {body}
      </Surface>
    );
  }
  return variant === "ledger" ? <>{body}</> : <CheckoutSection>{body}</CheckoutSection>;
}

/** The checkout page's block: a quiet heading and a hairline above, so it reads as part of paying, not a second form page. */
function CheckoutSection({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <section aria-labelledby="billing-details-checkout" className="border-t border-line pt-4">
      <h3 id="billing-details-checkout" className="text-sm font-medium text-ink">
        Billing details for your GST invoice
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}
