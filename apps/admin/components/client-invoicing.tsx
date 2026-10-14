import type { Payment, TaxInvoice } from "@firstfold/db";
import { stateName } from "@firstfold/shared/lib/directory/india-states";
import { displayPhoneText } from "@firstfold/shared/server/phone-display";
import type { ReactElement } from "react";
import { saveClientBillingDetailsAction, issueMissingInvoiceAction } from "@/app/(protected)/clients/[businessId]/invoice-actions";
import { BillingDetailsForm } from "@/components/billing-details-form";
import { hintClasses } from "@/components/console/field-styles";
import { IssueInvoiceButton } from "@/components/issue-invoice-button";
import { Notice } from "@/components/console/notice";
import { FactList, Quiet, Section } from "@/components/console/section";
import { INVOICE_NOTICES, type InvoiceNotice } from "@/lib/invoice-notices";
import type { ClientBillingDetails as ClientBillingDetailsView } from "@/lib/server/client-billing-details";
import { missingInvoiceRow, taxInvoiceRow } from "@/lib/tax-invoice-rows";

interface ClientBillingDetailsProps {
  readonly businessId: string;
  readonly details: ClientBillingDetailsView;
}

/**
 * The client page's Billing details section: what the customer (or staff) gave for their GST invoices, and the form
 * to correct it. A customer phones in with a wrong GSTIN; staff fix it here before issuing the invoice it holds up.
 */
export function ClientBillingDetails({ businessId, details }: ClientBillingDetailsProps): ReactElement {
  const { saved } = details;
  const contact = saved === null ? [] : [saved.email, displayPhoneText(saved.phone)].filter((part): part is string => part !== null);
  return (
    <Section id="billing-details" title="Billing details" aside="For GST invoices">
      {saved === null ? (
        <Quiet>Not given. Invoices use the business name and its onboarding address.</Quiet>
      ) : (
        <FactList
          items={[
            { label: "Billed to", value: saved.legalName },
            { label: "GSTIN", value: saved.gstin ?? "Not given" },
            { label: "Address", value: saved.address },
            { label: "State", value: stateName(saved.stateCode) ?? saved.stateCode },
            { label: "Billing contact", value: contact.length === 0 ? "The account’s own email and number" : contact.join(", ") },
          ]}
        />
      )}
      <details className="mt-6">
        <summary className="link-underline cursor-pointer text-sm font-semibold text-accent">Edit billing details</summary>
        <div className="mt-5">
          <BillingDetailsForm
            businessId={businessId}
            start={details.start}
            phoneCountries={details.phoneCountries}
            action={saveClientBillingDetailsAction}
          />
        </div>
      </details>
    </Section>
  );
}

interface ClientTaxInvoicesProps {
  readonly businessId: string;
  /** Newest first. */
  readonly invoices: readonly TaxInvoice[];
  /** Captured rupee payments with no invoice, oldest first. */
  readonly missing: readonly Payment[];
  readonly notice: InvoiceNotice | null;
  /** Another section on the page already carries the one "needs attention" mark (DESIGN.md), so this one stays plain. */
  readonly attentionTaken: boolean;
}

function asideFor(invoiceCount: number, missingCount: number): string {
  if (missingCount > 0) return `${missingCount} missing`;
  return invoiceCount === 0 ? "None yet" : `${invoiceCount} issued`;
}

function MissingInvoices({ businessId, missing }: { readonly businessId: string; readonly missing: readonly Payment[] }): ReactElement {
  return (
    <div className="mb-8">
      <ul aria-label="Payments missing an invoice" className="max-w-3xl divide-y divide-line">
        {missing.map((payment) => {
          const row = missingInvoiceRow(payment);
          return (
            <li key={row.paymentId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 first:pt-0">
              <p className="min-w-0 font-medium">{row.text}</p>
              <form action={issueMissingInvoiceAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="paymentId" value={row.paymentId} />
                <IssueInvoiceButton label={row.buttonLabel} />
              </form>
            </li>
          );
        })}
      </ul>
      <p className={`${hintClasses} max-w-xl`}>
        The invoice is dated today and lists the day the payment was made. It uses the billing details above, so correct
        them first if they are wrong.
      </p>
    </div>
  );
}

/**
 * The client page's Tax invoices section: a payment with no invoice (a failed or held one) with the button that issues
 * it, then every invoice issued, each with its PDF.
 */
export function ClientTaxInvoices({ businessId, invoices, missing, notice, attentionTaken }: ClientTaxInvoicesProps): ReactElement {
  return (
    <Section
      id="tax-invoices"
      title="Tax invoices"
      tone={missing.length > 0 && !attentionTaken ? "attention" : "plain"}
      aside={asideFor(invoices.length, missing.length)}
    >
      {notice === null ? null : (
        <Notice tone={INVOICE_NOTICES[notice].ok ? "ok" : "problem"} className="mb-6">
          {INVOICE_NOTICES[notice].text}
        </Notice>
      )}
      {missing.length === 0 ? null : <MissingInvoices businessId={businessId} missing={missing} />}
      {invoices.length === 0 ? (
        missing.length === 0 ? (
          <Quiet>No tax invoices yet.</Quiet>
        ) : null
      ) : (
        <ul aria-label="Tax invoices issued" className="max-w-3xl divide-y divide-line">
          {invoices.map((invoice) => {
            const row = taxInvoiceRow(invoice);
            return (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4 first:pt-0">
                <div className="min-w-0">
                  <p className="whitespace-nowrap font-medium tabular-nums">{row.number}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{row.detail}</p>
                </div>
                <div className="flex items-center gap-5">
                  <span className="font-serif text-lg tabular-nums">{row.total}</span>
                  <a href={row.downloadHref} aria-label={row.downloadLabel} className="link-underline text-sm font-semibold text-accent">
                    Download
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
