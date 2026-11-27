import {
  findActivePlan,
  findBillingProfile,
  findBillingState,
  listPaymentsForClient,
  listPriceOverridesForBusiness,
  listPaymentsNeedingAttention,
  listPaymentsWithoutTaxInvoice,
  listTaxInvoicesForBusiness,
} from "@brandbasket/db";
import type { ClientDetail } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { addOnById, isMonthlyAddOnId, perCycle } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { reactivationNetCents, websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { readStaffChargeNotice } from "@brandbasket/shared/lib/billing/charge-notices";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { MANUAL_PAYMENT_NOTICES, readManualPaymentNotice } from "@brandbasket/shared/lib/billing/manual-payment-notices";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { ClientCharges } from "@/components/client-charges";
import { ClientBillingDetails, ClientTaxInvoices } from "@/components/client-invoicing";
import { ClientPayments } from "@/components/client-payments";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { FactList, Section } from "@/components/console/section";
import { PaymentsNeedingAttention } from "@/components/payments-needing-attention";
import { attentionSection } from "@/lib/client-attention";
import { buildFeeFacts, dealFacts } from "@/lib/client-build-fee";
import { readInvoiceNotice } from "@/lib/invoice-notices";
import { readRefundNotice } from "@/lib/refund-form";
import type { ClientPackageFacts } from "@/lib/client-package";
import { loadManualCarriedCode } from "@/lib/server/billing-admin";
import { listClientCharges } from "@/lib/server/charges-admin";
import { clientBillingDetails } from "@/lib/server/client-billing-details";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";
import { resolvePaymentAttentionAction } from "../actions";
import { BillingFacts, ManualPaymentForm } from "../parts";
import { clearPriceOverrideAction } from "./override-actions";
import { markPaymentRefundedAction, refundPaymentAction } from "./refund-actions";

/** How many flagged payments one client page lists. */
const ATTENTION_SHOWN = 20;

/**
 * The money half of the Plan and billing tab. It checks the capability itself, so a role without it gets no payments,
 * invoices or charges from this component even if a page renders it by mistake.
 */
export async function BillingSection({
  client,
  query: sp,
  packageFacts,
  afterPayments,
}: {
  readonly client: ClientDetail;
  readonly query: Readonly<Record<string, string | string[] | undefined>>;
  readonly packageFacts: ClientPackageFacts | null;
  /** Rendered right under the payments table: the plan lines, so the table stays first and the plan follows it. */
  readonly afterPayments?: ReactNode;
}): Promise<ReactElement> {
  await requireStaffCan("money");
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
  const [plan, flagged, charges, billingState, billingProfile, taxInvoices, missingInvoices, overrides] = await Promise.all([
    canRecordPayment ? findActivePlan(db, client.currency, client.tier) : Promise.resolve(null),
    listPaymentsNeedingAttention(db, { businessId: client.businessId, limit: ATTENTION_SHOWN }),
    listClientCharges(client.businessId),
    findBillingState(db, client.businessId),
    // Only payments in rupees get tax invoices (D1), so a dollar client has nothing to show or correct here.
    invoiced ? findBillingProfile(db, client.businessId) : Promise.resolve(null),
    invoiced ? listTaxInvoicesForBusiness(db, client.businessId) : Promise.resolve([]),
    invoiced ? listPaymentsWithoutTaxInvoice(db, client.businessId) : Promise.resolve([]),
    listPriceOverridesForBusiness(db, client.businessId),
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
  const buildFee = buildFeeFacts(billingState?.subscription ?? null, client.currency);
  const deal = dealFacts(client.billing.deal);
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
        refundAction={refundPaymentAction}
        recordManualRefundAction={markPaymentRefundedAction}
      />

      {afterPayments}

      {deal === null ? null : (
        <Section title="Website build" aside="Advance taken first, balance before go-live, GST included">
          <FactList items={deal} />
          {client.billing.deal?.state === "building" ? (
            <div className="mt-6">
              <Link href={`/payment-links/${client.billing.deal.linkId}/edit`} className={buttonSecondary}>
                Edit deal
              </Link>
            </div>
          ) : null}
        </Section>
      )}

      {overrides.length === 0 ? null : (
        <Section title="Agreed prices">
          <FactList
            items={overrides.flatMap((row) =>
              isMonthlyAddOnId(row.addOn)
                ? [
                    {
                      label: "Agreed price",
                      value: (
                        <form action={clearPriceOverrideAction} className="flex flex-wrap items-center gap-3">
                          <input type="hidden" name="businessId" value={client.businessId} />
                          <input type="hidden" name="addOn" value={row.addOn} />
                          <input type="hidden" name="billingInterval" value={row.billingInterval} />
                          <span>
                            {addOnById(row.addOn).title} {formatMoney(row.netCents, client.currency)} {perCycle(row.billingInterval === "year" ? "year" : "month")}
                          </span>
                          <button type="submit" className={buttonSmall}>
                            Remove
                          </button>
                        </form>
                      ),
                    },
                  ]
                : [],
            )}
          />
        </Section>
      )}

      {buildFee === null ? null : (
        <Section title="Website build" aside="One time, GST included">
          <FactList items={buildFee} />
        </Section>
      )}

      <Section title="Billing">
        <BillingFacts client={client} state={paymentState} packageFacts={packageFacts} />
        {canRecordPayment && plan !== null ? (
          <ManualPaymentForm
            businessId={client.businessId}
            plan={plan}
            netCents={manualNetCents}
            reactivating={paymentState.kind === "lapsed"}
            carriedCode={carriedCode === null ? null : { code: carriedCode.code.code, monthsLeft: carriedCode.monthsLeft }}
          />
        ) : null}
        {billingState !== null && !billingState.hasEverPaid ? (
          <div className="mt-6">
            <Link href={`/payment-links/new?business=${client.businessId}`} className={buttonSecondary}>
              Create payment link
            </Link>
          </div>
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
