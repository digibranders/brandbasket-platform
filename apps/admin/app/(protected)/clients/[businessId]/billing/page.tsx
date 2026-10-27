import {
  findActivePlan,
  findBillingProfile,
  findBillingState,
  listPaymentsForClient,
  listPaymentsNeedingAttention,
  listPaymentsWithoutTaxInvoice,
  listTaxInvoicesForBusiness,
} from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { reactivationNetCents, websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { readStaffChargeNotice } from "@brandbasket/shared/lib/billing/charge-notices";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { MANUAL_PAYMENT_NOTICES, readManualPaymentNotice } from "@brandbasket/shared/lib/billing/manual-payment-notices";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { ClientCharges } from "@/components/client-charges";
import { ClientBillingDetails, ClientTaxInvoices } from "@/components/client-invoicing";
import { ClientPayments } from "@/components/client-payments";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { PaymentsNeedingAttention } from "@/components/payments-needing-attention";
import { attentionSection } from "@/lib/client-attention";
import { readInvoiceNotice } from "@/lib/invoice-notices";
import { readRefundNotice } from "@/lib/refund-form";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { loadManualCarriedCode } from "@/lib/server/billing-admin";
import { listClientCharges } from "@/lib/server/charges-admin";
import { clientBillingDetails } from "@/lib/server/client-billing-details";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { resolvePaymentAttentionAction } from "../actions";
import { BillingFacts, ManualPaymentForm } from "../parts";
import { markPaymentRefundedAction } from "./refund-actions";

export const metadata: Metadata = { title: "Client billing" };

/** How many flagged payments one client page lists. */
const ATTENTION_SHOWN = 20;

export default async function ClientBillingPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { client } = await openClientTab(businessId, "billing");
  const sp = await searchParams;
  const notice = readManualPaymentNotice(sp.payment);
  const chargesNotice = readStaffChargeNotice(sp.charges);
  const invoiceNotice = readInvoiceNotice(sp.invoice);
  const refundNotice = readRefundNotice(sp.refund);
  const db = getStaffDb();
  const payments = await listPaymentsForClient(db, client.businessId, 100);
  const renderedAt = new Date();
  const paymentState = clientPaymentState(client.billing, renderedAt);
  const canRecordPayment = paymentState.kind === "not-paid" || paymentState.kind === "checkout-open" || paymentState.kind === "lapsed";
  const invoiced = client.currency === "INR";
  const [plan, flagged, charges, billingState, billingProfile, taxInvoices, missingInvoices, clientAddOns] = await Promise.all([
    canRecordPayment ? findActivePlan(db, client.currency, client.tier) : Promise.resolve(null),
    listPaymentsNeedingAttention(db, { businessId: client.businessId, limit: ATTENTION_SHOWN }),
    listClientCharges(client.businessId),
    findBillingState(db, client.businessId),
    // Only payments in rupees get tax invoices (D1), so a dollar client has nothing to show or correct here.
    invoiced ? findBillingProfile(db, client.businessId) : Promise.resolve(null),
    invoiced ? listTaxInvoicesForBusiness(db, client.businessId) : Promise.resolve([]),
    invoiced ? listPaymentsWithoutTaxInvoice(db, client.businessId) : Promise.resolve([]),
    loadClientAddOns(client.businessId, renderedAt),
  ]);
  // Exactly what recordManualFirstPayment books: the basket they lapsed with, less the code a lapse keeps, else the website at list.
  const lapsedBasket = plan !== null && paymentState.kind === "lapsed" ? await loadReactivationBasket(db, client.businessId) : null;
  const carriedCode = plan === null || lapsedBasket === null ? null : await loadManualCarriedCode(db, client.businessId, lapsedBasket, plan.currency);
  const manualNetCents =
    plan === null
      ? 0
      : lapsedBasket === null
        ? websiteAloneNetCents(plan.currency)
        : reactivationNetCents(lapsedBasket, plan.currency) - (carriedCode?.discountCents ?? 0);
  // One attention section on this tab: flagged payments first, else missing invoices.
  const attention = attentionSection({ flaggedCount: flagged.length, previewIsLate: false, missingInvoiceCount: invoiced ? missingInvoices.length : 0 });

  return (
    <>
      {notice === null ? null : (
        <div className="mb-8">
          <Notice tone={MANUAL_PAYMENT_NOTICES[notice].ok ? "ok" : "problem"}>{MANUAL_PAYMENT_NOTICES[notice].text}</Notice>
        </div>
      )}

      {flagged.length === 0 ? null : (
        <Section
          tone="attention"
          title={flagged.length === 1 ? "A payment needs attention" : `${flagged.length} payments need attention`}
          aside="They were told we received it and will be in touch. They aren’t asked to pay again until it’s sorted."
        >
          <PaymentsNeedingAttention payments={flagged} linkToClient={false} resolveAction={resolvePaymentAttentionAction} />
        </Section>
      )}

      <ClientPayments
        businessId={client.businessId}
        payments={payments}
        canRefund
        notice={refundNotice}
        refundAction={markPaymentRefundedAction}
      />

      <Section title="Billing">
        <BillingFacts client={client} state={paymentState} packageFacts={clientAddOns.package} />
        {canRecordPayment && plan !== null ? (
          <ManualPaymentForm
            businessId={client.businessId}
            plan={plan}
            netCents={manualNetCents}
            reactivating={paymentState.kind === "lapsed"}
            carriedCode={carriedCode === null ? null : { code: carriedCode.code.code, monthsLeft: carriedCode.monthsLeft }}
          />
        ) : null}
        {canRecordPayment && plan === null ? (
          <p className="mt-6 text-sm text-ink-2">
            There is no active plan for {BILLING_CURRENCY_LABELS[client.currency]}, so no payment can be recorded.
          </p>
        ) : null}
      </Section>

      {invoiced ? (
        <>
          <ClientBillingDetails
            businessId={client.businessId}
            details={clientBillingDetails({ profile: billingProfile, businessName: client.businessName, onboarding: client.profile })}
          />
          <ClientTaxInvoices
            businessId={client.businessId}
            invoices={taxInvoices}
            missing={missingInvoices}
            notice={invoiceNotice}
            attentionTaken={attention !== "invoices"}
          />
        </>
      ) : null}

      <ClientCharges businessId={client.businessId} charges={charges} plan={billingState?.plan ?? null} notice={chargesNotice} />
    </>
  );
}
