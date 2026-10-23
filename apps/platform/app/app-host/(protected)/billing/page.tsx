import type { CurrentPaymentMethod } from "@brandbasket/db";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { EmailUs } from "@/components/panel/email-us";
import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { SectionHeading, Surface } from "@brandbasket/shared/ui/panel/surface";
import { PAYMENT_RECEIVED_MESSAGE, PAYMENT_STEP_HREF } from "@brandbasket/shared/lib/billing/payment-step";
import { paymentReturnView, readPaymentReturn } from "@brandbasket/shared/lib/billing/payment-return";
import { websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { planLabel } from "@brandbasket/shared/lib/billing/receipt-title";
import { describePlanTerms, monthlyPaymentAmount } from "@brandbasket/shared/lib/billing/terms";
import { firstIncompleteStep, onboardingStepHref } from "@brandbasket/shared/lib/onboarding/steps";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { BillingDetails } from "@/components/panel/billing/billing-details";
import { MonthlyBilling } from "@/components/panel/billing/monthly-billing";
import { NoticeBanner } from "@/components/panel/notice-banner";
import { PaymentWaiting } from "@/components/panel/payment-waiting";
import { PaymentMethod } from "@/components/panel/billing/payment-method";
import { PlanSummary, priceNote } from "@/components/panel/billing/plan-summary";
import { ReactivatePlan } from "@/components/panel/billing/reactivate-plan";
import { ServicePicker } from "@/components/panel/billing/service-picker";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import { paymentMethodView, renewsAutomatically } from "@/lib/billing/payment-method-view";
import { CHARGE_NOTICES, readChargeNotice } from "@/lib/billing/charge-notices";
import { billingMonths } from "@/lib/billing/billing-months";
import { listOpenCustomerCharges } from "@/lib/server/charges";
import { findCustomerPaymentMethod, findReactivation, findReactivationPlan, listCustomerReceipts } from "@/lib/server/billing";
import { loadBillingDetailsView } from "@/lib/server/billing-details";
import { MEMBERSHIP_SERVICES_PARAM } from "@/lib/membership";
import { reactivateAction } from "./actions";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import { getProjectOverview } from "@/lib/server/onboarding";

export const metadata: Metadata = { title: "Billing" };

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <Surface>
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-5">{children}</div>
    </Surface>
  );
}

/** The billing details card for a business billed in rupees, or nothing for one that gets no tax invoices. */
function BillingDetailsSection({ view }: { readonly view: BillingDetailsView | null }): ReactElement | null {
  if (view === null) return null;
  return (
    <div className="mt-8">
      <BillingDetails view={view} variant="card" />
    </div>
  );
}

/**
 * How the customer pays, or nothing before their first payment. `renews` is whether the provider takes the next payment
 * by itself (see renewsAutomatically); the listing page has no plan, so it passes false. Only the branches that draw it
 * read the payment method.
 */
function PaymentMethodSection({
  method,
  renews,
}: {
  readonly method: CurrentPaymentMethod | null;
  readonly renews: boolean;
}): ReactElement | null {
  if (method === null) return null;
  return (
    <div className="mt-8">
      <PaymentMethod view={paymentMethodView(method, renews)} emailUs={<EmailUs />} />
    </div>
  );
}

function PageHeading({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <header className="border-b border-line pb-6">
      <h1 className="panel-title">Billing</h1>
      <div className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{children}</div>
    </header>
  );
}

/** What Billing says about a plan payment the customer just returned from (`?payment=`). Fixed words only. */
const PAYMENT_CONFIRMED = { ok: true, text: "Payment confirmed. Your website is back online." } as const;
const PAYMENT_FAILED = { ok: false, text: "That payment didn’t go through, and nothing was taken. You can try again." } as const;

/**
 * A renewal Razorpay could not take and is retrying. The paid period is untouched, so the customer is told what is going
 * on and when the website would go offline if the retries keep failing. There is no card or UPI change screen yet, so
 * changing it is a message to us.
 */
function RenewalFailingCard({ until }: { readonly until: Date }): ReactElement {
  return (
    <section aria-labelledby="renewal-failing-heading" className="mt-6 rounded-card bg-accent-pale p-6 text-accent-deep sm:p-7">
      <h2 id="renewal-failing-heading" className="panel-section text-base">
        We couldn’t take your last payment
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed">
        We’ll try again on our own. Your website stays online until <LocalDate iso={until.toISOString()} />. If the payments
        keep failing, it goes offline then, and you can restart it from this page.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed">
        Check that the account, card or UPI you subscribed with has enough balance and hasn’t expired. To change it, email
        us at <EmailUs />.
      </p>
    </section>
  );
}

/** The services the address names (`?services=managed-website,digital-growth`), as raw text: findReactivation keeps the catalogue ids. */
function readServicesParam(raw: string | string[] | undefined): string[] {
  return (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",");
}

interface BillingPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const { billing, tenant } = customer;
  const brand = await requestBrand();
  const [receipts, billingDetails] = await Promise.all([listCustomerReceipts(customer), loadBillingDetailsView(customer)]);

  // A free listing account has no plan: only what it owes for ad spots it won, and the receipts for what it paid.
  if ((await getCustomerBusinessKind(tenant.userId, tenant.businessId)) === "listing") {
    const [openCharges, notice, paymentMethod] = await Promise.all([
      listOpenCustomerCharges(customer),
      searchParams.then((params) => readChargeNotice(params.charge)),
      findCustomerPaymentMethod(customer),
    ]);
    return (
      <>
        <PageHeading>
          <p>What you owe for ad spots you’ve won, and the invoices and receipts for what you’ve paid.</p>
        </PageHeading>
        {notice === null ? null : <NoticeBanner {...CHARGE_NOTICES[notice]} />}
        <PaymentMethodSection method={paymentMethod} renews={false} />
        <BillingDetailsSection view={billingDetails} />
        <div className="mt-8">
          <MonthlyBilling
            months={billingMonths(receipts, openCharges, brand)}
            lede="Each month’s ad spots, with a PDF invoice or receipt for every payment."
            emptyBody="Once your first payment goes through, each month’s ad spots show here, with an invoice or receipt for every payment."
          />
        </div>
      </>
    );
  }

  if (billing.status === "unpaid") {
    if (billing.paymentUnderReview) {
      return (
        <>
          <PageHeading>
            <p>{PAYMENT_RECEIVED_MESSAGE}</p>
          </PageHeading>
          <div className="mt-8 max-w-2xl">
            <Card title="What happens next">
              <p className="leading-relaxed">
                There’s nothing more for you to pay. If you need us sooner, email <EmailUs />.
              </p>
            </Card>
            <BillingDetailsSection view={billingDetails} />
          </div>
          <div className="mt-12">
            <MonthlyBilling months={billingMonths(receipts, [], brand)} />
          </div>
        </>
      );
    }
    const { completed } = await getProjectOverview();
    const nextStep = firstIncompleteStep(new Set(completed));
    const ready = nextStep === "review";
    return (
      <>
        <PageHeading>
          <p>Payment happens at the end of setup.</p>
        </PageHeading>
        <div className="mt-8 max-w-2xl">
          <Card title="How paying works">
            <p className="text-sm leading-relaxed">
              Once you’ve told us about your business, you’ll check your answers and pay on the last step, Check and
              send. Your payment sends everything to us, and we start building.
            </p>
            {billing.plan === null ? (
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                We can’t take payment in your currency just yet. Email us at <EmailUs /> and we’ll sort it out.
              </p>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describePlanTerms(billing.plan, websiteAloneNetCents(billing.plan.currency))}</p>
            )}
            <ButtonLink href={ready ? PAYMENT_STEP_HREF : onboardingStepHref(nextStep)} className="mt-6">
              {ready ? "Go to Check and send" : "Finish setup"}
              <ArrowIcon className="size-4" />
            </ButtonLink>
          </Card>
          <BillingDetailsSection view={billingDetails} />
        </div>
      </>
    );
  }

  const { plan, subscription } = billing;
  const lapsed = billing.status === "lapsed";
  const params = await searchParams;
  const [openCharges, reactivationPlan, reactivation, paymentMethod] = await Promise.all([
    listOpenCustomerCharges(customer),
    lapsed ? findReactivationPlan(customer) : Promise.resolve(null),
    lapsed ? findReactivation(customer, readServicesParam(params[MEMBERSHIP_SERVICES_PARAM])) : Promise.resolve(null),
    findCustomerPaymentMethod(customer),
  ]);
  // Razorpay's confirmation arrives separately from the customer's return, so a page drawn straight after paying waits for
  // it and then says what happened, rather than showing the old state under a "received" notice.
  const returnView = paymentReturnView({
    returned: readPaymentReturn(params.payment),
    hasAccess: billing.hasAccess,
    paymentUnderReview: billing.paymentUnderReview,
  });
  const chargeReturn = readChargeNotice(params.charge);
  // A charge payment is confirmed once none is open any more.
  const chargeWaiting = chargeReturn === "processing" && openCharges.length > 0;
  const notice = chargeReturn === "processing" ? (chargeWaiting ? null : "paid") : chargeReturn;
  return (
    <>
      <PageHeading>
        <p>Your plan, and each month’s bill with its invoices and receipts.</p>
      </PageHeading>
      {notice === null ? null : <NoticeBanner {...CHARGE_NOTICES[notice]} />}
      {chargeWaiting ? (
        <div className="mt-6">
          <PaymentWaiting
            waitKey="billing:charge"
            waitingText="Thanks, we’re confirming your payment with the bank. This page updates by itself."
            delayedText="Confirming your payment is taking longer than usual."
            supportEmail={supportEmailOf(brand)}
          />
        </div>
      ) : null}
      {billing.renewalFailingUntil === null ? null : <RenewalFailingCard until={billing.renewalFailingUntil} />}
      {returnView === "confirmed" ? <NoticeBanner {...PAYMENT_CONFIRMED} /> : null}
      {returnView === "failed" ? <NoticeBanner {...PAYMENT_FAILED} /> : null}
      <div className="mt-8">
        {returnView === "confirming" ? (
          <PaymentWaiting
            waitKey="billing:plan"
            waitingText="We’ve received your payment. Confirming it with the bank…"
            delayedText="Confirming your payment is taking longer than usual."
            supportEmail={supportEmailOf(brand)}
          />
        ) : lapsed && reactivationPlan !== null && reactivation !== null ? (
          <ReactivatePlan
            planName={planLabel(reactivationPlan.name)}
            monthlyAmount={monthlyPaymentAmount(reactivationPlan, reactivation.netCents - reactivation.discountCents)}
            priceNote={priceNote(reactivationPlan, reactivation.discountCents, reactivation.netCents)}
            action={reactivateAction}
            services={reactivation.cancelled ? reactivation.services : null}
          >
            {reactivation.cancelled ? (
              <ServicePicker selected={reactivation.services} currency={reactivationPlan.currency} />
            ) : null}
          </ReactivatePlan>
        ) : lapsed || plan === null || subscription === null ? (
          <Card title="Your plan">
            <p className="text-sm leading-relaxed text-ink-soft">
              We couldn’t find your plan’s details. Email us at <EmailUs /> and we’ll sort it out.
            </p>
          </Card>
        ) : (
          <PlanSummary plan={plan} subscription={subscription} now={new Date()} hasWebsite={billing.hasWebsite} brand={brand} />
        )}
      </div>
      <PaymentMethodSection method={paymentMethod} renews={renewsAutomatically(billing)} />
      <BillingDetailsSection view={billingDetails} />
      <div className="mt-12">
        <MonthlyBilling months={billingMonths(receipts, openCharges, brand)} />
      </div>
    </>
  );
}
