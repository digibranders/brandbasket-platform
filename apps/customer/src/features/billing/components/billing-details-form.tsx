"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button, useToast } from "@/ui";
import { BillingFieldset } from "../../checkout/components/billing-fieldset";
import type { BillingDetailsView } from "../../checkout/rules/billing-details-view";
import { saveBillingDetailsAction } from "../actions";

/*
 * Billing details on Payment and details: the checkout's own fields (GSTIN check, pincode lookup, state), saved by the same
 * server function as the checkout. The owner edits them; everyone else reads who the invoices go to.
 */
export function BillingDetailsForm({ view, canManage }: { readonly view: BillingDetailsView; readonly canManage: boolean }) {
  const toast = useToast();
  const [state, action, pending] = useActionState(async (previous: ActionResult | null, formData: FormData) => {
    const result = await saveBillingDetailsAction(previous, formData);
    if (result.ok) toast("Billing details saved.");
    return result;
  }, null);
  const failure = state !== null && !state.ok && !pending ? state : null;

  const { saved } = view;
  if (!canManage) {
    return saved === null ? (
      <p className="type-body text-ink-3">No billing details are saved yet.</p>
    ) : (
      <p className="type-body text-ink-3">
        Your GST invoice goes to <span className="text-ink">{saved.legalName}</span>
        {saved.gstin === null ? "" : `, GSTIN ${saved.gstin}`}.
      </p>
    );
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
      <p className="type-body text-ink-3">Your GST invoices are made out from these details. A change applies to invoices issued after it.</p>
      <BillingFieldset view={view} errors={failure?.fieldErrors} />
      <div>
        <Button type="submit" variant="primary" pending={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
