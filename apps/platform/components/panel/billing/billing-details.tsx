"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import { PageSection } from "@/components/v2/page";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { saveBillingDetailsAction } from "@/app/app-host/(protected)/billing/actions";
import { BillingDetailsForm, SAVED_TEXT } from "@/components/panel/billing/billing-details-form";
import type { PanelFormAction } from "@/components/panel/form/panel-form";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";

interface BillingDetailsProps {
  readonly view: BillingDetailsView;
  /** "card" on Billing; "checkout" above a pay button, where the form starts open because payment waits for details. */
  readonly variant: "card" | "checkout";
}

/**
 * The billing details for GST invoices: what is saved, and the form to add or change them. Open on the form until
 * details are saved; after a save the form closes, the facts show what was saved, and one line says what the save
 * changes. Edit opens the form again. On a checkout page the form starts open and payment waits for saved details: the
 * first tax invoice is made out from them and cannot be changed once issued.
 */
export function BillingDetails({ view, variant }: BillingDetailsProps): ReactElement {
  const { saved } = view;
  const inCheckout = variant !== "card";
  // The form starts open on a checkout page, where payment waits for it, and folded away on Billing so the payments are not pushed down the page.
  const [editing, setEditing] = useState(saved === null && inCheckout);
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
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <Fact label="Billed to" value={saved.legalName} />
        <Fact label="GSTIN" value={saved.gstin ?? "Not given"} />
        <Fact label="Address" value={saved.address} />
        <Fact label="State" value={stateName(saved.stateCode) ?? saved.stateCode} />
      </dl>
    ) : (
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Your GST invoice goes to <span className="text-ink">{saved.legalName}</span>
        {saved.gstin === null ? "" : `, GSTIN ${saved.gstin}`}.
      </p>
    );

  const intro =
    saved === null ? (
      <p className={`max-w-2xl text-sm leading-relaxed text-ink-2 ${inCheckout ? "mt-3" : ""}`}>
        {!inCheckout
          ? "Add your billing address, and your GSTIN if you have one, to get GST invoices in the right name. They apply to invoices issued after you save them."
          : "Add your billing address, and your GSTIN if you have one. Your GST invoice is made out from them and cannot be changed once it is issued."}
      </p>
    ) : null;

  const body = (
    <>
      {intro}
      {facts}
      {/* The region is always in the page, so a screen reader is watching it when the line arrives. */}
      <div role="status" aria-live="polite">
        {justSaved ? (
          <p ref={statusRef} tabIndex={-1} className="mt-4 text-sm text-ink-2 outline-none">
            {SAVED_TEXT}
          </p>
        ) : null}
      </div>
      {saved === null && !inCheckout ? (
        <button type="button" className={`${SOFT_BUTTON} mt-4`} aria-expanded={editing} aria-controls="billing-details-form" onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Add billing details"}
        </button>
      ) : null}
      {saved === null ? null : (
        <button
          type="button"
          className={`${SOFT_BUTTON} mt-5`}
          aria-expanded={editing}
          aria-controls="billing-details-form"
          onClick={() => {
            setJustSaved(false);
            setEditing(!editing);
          }}
        >
          {editing ? "Close" : "Edit billing details"}
        </button>
      )}
      {editing ? (
        <div id="billing-details-form" className={saved === null && inCheckout ? "mt-4" : "mt-6 border-t border-line pt-6"}>
          <BillingDetailsForm view={view} action={saveAndClose} layout={inCheckout ? "narrow" : "wide"} />
        </div>
      ) : null}
    </>
  );

  if (variant === "card") {
    return (
      <PageSection id="billing-details" title="Billing details">
        {body}
      </PageSection>
    );
  }
  return <CheckoutSection>{body}</CheckoutSection>;
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
      <dt className="text-ink-2">{label}</dt>
      <dd className="mt-1 break-words text-ink">{value}</dd>
    </div>
  );
}
