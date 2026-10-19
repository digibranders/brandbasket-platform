import type { Metadata } from "next";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { EmailUs } from "@/components/panel/email-us";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import {
  BrandSummary,
  BusinessSummary,
  ContentSummary,
  DomainSummary,
  SummaryCard,
} from "@/components/panel/onboarding-summary";
import { BillingDetails } from "@/components/panel/billing/billing-details";
import { PaymentWaiting } from "@/components/panel/payment-waiting";
import { ReviewSubmitForm } from "@/components/panel/review-submit-form";
import { StepHeading } from "@/components/panel/step-heading";
import {
  PAYMENT_RECEIVED_MESSAGE,
  PLAN_ENDED_MESSAGE,
  REACTIVATE_HREF,
  paymentStep,
  type PaymentStep,
} from "@brandbasket/shared/lib/billing/payment-step";
import { paymentReturnView, readPaymentReturn } from "@brandbasket/shared/lib/billing/payment-return";
import { cn } from "@brandbasket/shared/lib/cn";
import { firstMissing, onboardingChecklist, type ChecklistItem } from "@brandbasket/shared/lib/onboarding/checklist";
import { checklistInputFrom } from "@/lib/onboarding/snapshot";
import { onboardingStepHref, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import { loadBillingDetailsView } from "@/lib/server/billing-details";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { ReferralCodeForm } from "@/components/panel/referral-code-form";
import { findLapsedAppliedCode, resolveAppliedDiscount } from "@/lib/server/referrals";
import type { PlanDiscount } from "@brandbasket/shared/lib/billing/terms";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { applyReferralCode, removeReferralCode, startCheckout, submitOnboarding } from "./actions";

export const metadata: Metadata = { title: "Check and send" };

function Checklist({ items }: { readonly items: readonly ChecklistItem[] }): ReactElement {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
              item.passed ? "bg-ink text-paper" : "border border-accent-deep text-accent-deep",
            )}
          >
            {item.passed ? <TickIcon className="size-3.5" /> : "!"}
          </span>
          <span>
            {item.label}
            <span className="sr-only">{item.passed ? " (done)" : " (still needed)"}</span>
            {item.passed ? null : (
              <>
                {" "}
                <Link href={onboardingStepHref(item.step)} className="link-underline text-sm text-accent-deep">
                  Add it
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const REFUND_NOTE =
  "Changed your mind? You can ask for a full refund within 7 days of paying, as long as we haven’t started building.";

function PaymentSection({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby="payment-heading" className="rounded-card border border-line bg-card p-6 sm:p-8">
      <h2 id="payment-heading" className="panel-section">
        {heading}
      </h2>
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

/** The code field, shown only where there is still a payment to discount. */
function ReferralPanel({
  discount,
  currency,
  lapsedCode,
}: {
  readonly discount: PlanDiscount | null;
  readonly currency: MoneyCurrency;
  readonly lapsedCode: string | null;
}): ReactElement {
  return (
    <div className="border-t border-line pt-6">
      <ReferralCodeForm
        applyAction={applyReferralCode}
        removeAction={removeReferralCode}
        discount={discount}
        currency={currency}
        lapsedCode={lapsedCode}
      />
    </div>
  );
}

function PaymentPanel({
  step,
  checklist,
  discount,
  currency,
  lapsedCode,
  billingDetails,
}: {
  readonly step: PaymentStep;
  readonly checklist: readonly ChecklistItem[];
  readonly discount: PlanDiscount | null;
  readonly currency: MoneyCurrency;
  readonly lapsedCode: string | null;
  /** For a business billed in rupees: the form above the pay button, open until details are saved. Null otherwise. */
  readonly billingDetails: BillingDetailsView | null;
}): ReactElement | null {
  switch (step.kind) {
    case "pay-and-send":
      return (
        <PaymentSection heading="Pay and send">
          <Checklist items={checklist} />
          <p className="leading-relaxed">{step.terms}</p>
          {billingDetails === null ? null : <BillingDetails view={billingDetails} variant="checkout" />}
          <ReviewSubmitForm
            action={startCheckout}
            ready={step.ready}
            label={`Pay ${step.amount} and send`}
            pendingLabel="Opening checkout…"
            note={
              <>
                <p>Once you pay, we start building and your answers lock. You can still email us about changes.</p>
                <p className="mt-2">{REFUND_NOTE}</p>
              </>
            }
          />
          <ReferralPanel discount={discount} currency={currency} lapsedCode={lapsedCode} />
        </PaymentSection>
      );
    case "pay":
      return (
        <PaymentSection heading="Your payment">
          <p className="leading-relaxed">
            You’ve already sent us your answers. {step.terms}
          </p>
          {billingDetails === null ? null : <BillingDetails view={billingDetails} variant="checkout" />}
          <ReviewSubmitForm
            action={startCheckout}
            ready
            label={`Pay ${step.amount}`}
            pendingLabel="Opening checkout…"
            note={<p>{REFUND_NOTE}</p>}
          />
          <ReferralPanel discount={discount} currency={currency} lapsedCode={lapsedCode} />
        </PaymentSection>
      );
    case "send":
      return (
        <PaymentSection
          heading={
            step.missing === null
              ? "Payment received"
              : "Payment received, one thing is missing before we can start"
          }
        >
          {step.missing === null ? (
            <p className="leading-relaxed">Thank you. Send it to us and we’ll start building.</p>
          ) : (
            <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-accent-deep">
              We still need {step.missing.label.charAt(0).toLowerCase()}
              {step.missing.label.slice(1)}.{" "}
              <Link href={onboardingStepHref(step.missing.step)} className="link-underline font-medium">
                Add it now
              </Link>
              , then send it to us here. You won’t pay again.
            </p>
          )}
          <Checklist items={checklist} />
          <ReviewSubmitForm
            action={submitOnboarding}
            ready={step.missing === null}
            label="Send it to us"
            pendingLabel="Sending…"
            note={
              <p>
                Once you send this, we start building and your answers are locked. If anything changes after that, you
                can still email us.
              </p>
            }
          />
        </PaymentSection>
      );
    case "reactivate":
      return (
        <PaymentSection heading="Your plan has ended">
          <p className="leading-relaxed">{PLAN_ENDED_MESSAGE}</p>
          <Link href={REACTIVATE_HREF} className="link-underline mt-3 inline-block text-ink">
            Go to Billing
          </Link>
        </PaymentSection>
      );
    case "under-review":
      return (
        <PaymentSection heading="Payment received">
          <p className="leading-relaxed">
            {PAYMENT_RECEIVED_MESSAGE} If you need us sooner, email <EmailUs />.
          </p>
        </PaymentSection>
      );
    case "no-plan":
      return (
        <PaymentSection heading="We can’t take payment just yet">
          <p className="leading-relaxed">
            Email us at <EmailUs /> and we’ll sort it out. Your answers are all still here.
          </p>
        </PaymentSection>
      );
    case "none":
      return null;
    default: {
      const unhandled: never = step;
      throw new Error(`Unhandled payment step: ${JSON.stringify(unhandled)}`);
    }
  }
}

interface ReviewStepPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReviewStepPage({ searchParams }: ReviewStepPageProps): Promise<ReactElement> {
  const { billing, tenant } = await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();
  const { payment } = await searchParams;
  const editable = !snapshot.locked;
  const checklist = onboardingChecklist(checklistInputFrom(snapshot));
  // Re-validated on every render, so a code retired since it was applied quietly stops discounting rather than
  // showing a price the checkout would refuse to honour.
  const discount =
    billing.plan === null || billing.status !== "unpaid"
      ? null
      : await resolveAppliedDiscount(tenant.businessId, billing.plan, new Date());
  const lapsedCode =
    billing.plan === null || billing.status !== "unpaid" || discount !== null
      ? null
      : await findLapsedAppliedCode(tenant.businessId, billing.plan, new Date());
  const step = paymentStep({
    status: billing.status,
    plan: billing.plan,
    hasProject: snapshot.project !== null,
    locked: snapshot.locked,
    missing: firstMissing(checklist),
    paymentUnderReview: billing.paymentUnderReview,
    discount,
  });
  // Only where a pay button follows: the form asks before the customer pays, so after paying it would be too late.
  const billingDetails =
    step.kind === "pay-and-send" || step.kind === "pay" ? await loadBillingDetailsView({ tenant, billing }) : null;
  const editHref = (key: OnboardingStepKey): string | undefined => (editable ? onboardingStepHref(key) : undefined);
  // What the address says about a payment just made, set against what has actually been recorded: the page can be drawn
  // before Razorpay's confirmation arrives, so it waits for it rather than guessing.
  const returnView = paymentReturnView({
    returned: readPaymentReturn(payment),
    hasAccess: billing.hasAccess,
    paymentUnderReview: billing.paymentUnderReview,
  });

  return (
    <>
      <StepHeading step="review">
        <p>
          {!editable
            ? "Everything you sent us."
            : billing.status === "paid"
              ? "Look it over. Anything you want to change, edit it now, then send it to us."
              : "Everything look right? You can still change anything. Once you pay, we start building and your answers lock."}
        </p>
      </StepHeading>

      {readPaymentReturn(payment) === "received" && billing.paymentUnderReview ? (
        <p role="status" className="mb-5 rounded-control bg-paper-deep px-5 py-4 text-ink">
          {PAYMENT_RECEIVED_MESSAGE}
        </p>
      ) : null}

      {returnView === "confirming" ? (
        <div className="mb-5">
          <PaymentWaiting
            waitKey="review:first-payment"
            waitingText="We’ve received your payment. Confirming it with the bank…"
            delayedText="Confirming your payment is taking longer than usual."
            supportEmail={supportEmailOf(await requestBrand())}
          />
        </div>
      ) : null}

      {returnView === "confirmed" ? (
        <p role="status" className="mb-5 rounded-control bg-paper-deep px-5 py-4 text-ink">
          Payment confirmed. Thank you.
        </p>
      ) : null}

      {returnView === "failed" && (step.kind === "pay-and-send" || step.kind === "pay") ? (
        <p role="alert" className="mb-5 rounded-control bg-accent-pale px-5 py-4 text-accent-deep">
          We couldn’t confirm that payment, so nothing has been recorded. You can try again below.
        </p>
      ) : null}

      <div className="space-y-5">
        <SummaryCard title="Your business" editHref={editHref("business")}>
          <BusinessSummary profile={snapshot.profile} hours={snapshot.hours} />
        </SummaryCard>
        <SummaryCard title="What you offer" editHref={editHref("content")}>
          <ContentSummary services={snapshot.services} brief={snapshot.brief} />
        </SummaryCard>
        <SummaryCard title="Logo and photos" editHref={editHref("brand")}>
          <BrandSummary logo={snapshot.logo} photos={snapshot.photos} />
        </SummaryCard>
        <SummaryCard title="Your domain" editHref={editHref("domain")}>
          <DomainSummary domain={snapshot.domain} />
        </SummaryCard>

        {/* Not while the payment just made is being confirmed: there is nothing to pay, and a second press would charge again. */}
        {returnView === "confirming" ? null : (
          <PaymentPanel
            step={step}
            checklist={checklist}
            discount={discount}
            currency={billing.plan?.currency ?? "USD"}
            lapsedCode={lapsedCode}
            billingDetails={billingDetails}
          />
        )}
      </div>
    </>
  );
}
