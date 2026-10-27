import type { Metadata } from "next";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { EmailUs } from "@/components/panel/email-us";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
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
import { StepAside } from "@/components/panel/step-aside";
import { LIFT, STACK, SOFT_BUTTON } from "@/components/v2/classes";
import { PageColumns } from "@/components/v2/page";
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
import { sentHeading } from "@/lib/onboarding/review-copy";
import { onboardingStepHref, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import { loadBillingDetailsView } from "@/lib/server/billing-details";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { ReferralCodeForm } from "@/components/panel/referral-code-form";
import { codeBasisFor, findLapsedAppliedCode, resolveAppliedDiscount } from "@/lib/server/referrals";
import { WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";
import type { PlanDiscount } from "@brandbasket/shared/lib/billing/terms";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { applyReferralCode, removeReferralCode, startCheckout, submitOnboarding } from "./actions";

export const metadata: Metadata = { title: "Check and send" };

function Checklist({ items }: { readonly items: readonly ChecklistItem[] }): ReactElement {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
          {item.passed ? (
            <CheckCircle size={20} weight="fill" aria-hidden="true" className="mt-px shrink-0 text-sage" />
          ) : (
            <WarningCircle size={20} aria-hidden="true" className="mt-px shrink-0 text-rattan-ink" />
          )}
          <span className="min-w-0">
            {item.label}
            <span className="sr-only">{item.passed ? " (done)" : " (still needed)"}</span>
            {item.passed ? null : (
              <>
                {" "}
                <Link href={onboardingStepHref(item.step)} className="font-semibold text-ink underline underline-offset-4">
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

function PaymentSection({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby="payment-heading" className={cn(LIFT, "min-w-0 p-5 md:p-8")}>
      <h2 id="payment-heading" className="font-display text-[1.25rem] font-semibold leading-tight tracking-[-0.025em] text-ink">
        {heading}
      </h2>
      <div className="mt-5 grid gap-6 text-sm">{children}</div>
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
  missingCount,
  discount,
  currency,
  lapsedCode,
  billingDetails,
}: {
  readonly step: PaymentStep;
  readonly checklist: readonly ChecklistItem[];
  /** How many checklist lines are still open. */
  readonly missingCount: number;
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
          <p className="leading-relaxed text-ink-2">{step.terms}</p>
          {billingDetails === null ? null : <BillingDetails view={billingDetails} variant="checkout" />}
          <ReviewSubmitForm
            action={startCheckout}
            ready={step.ready}
            label={`Pay ${step.amount} and send`}
            pendingLabel="Opening checkout…"
            note={<p>Once you pay, we start building and your answers lock. You can still email us about changes.</p>}
          />
          <ReferralPanel discount={discount} currency={currency} lapsedCode={lapsedCode} />
        </PaymentSection>
      );
    case "pay":
      return (
        <PaymentSection heading="Your payment">
          <p className="leading-relaxed text-ink-2">
            You’ve already sent us your answers. {step.terms}
          </p>
          {billingDetails === null ? null : <BillingDetails view={billingDetails} variant="checkout" />}
          <ReviewSubmitForm
            action={startCheckout}
            ready
            label={`Pay ${step.amount}`}
            pendingLabel="Opening checkout…"
          />
          <ReferralPanel discount={discount} currency={currency} lapsedCode={lapsedCode} />
        </PaymentSection>
      );
    case "send":
      return (
        <PaymentSection heading={sentHeading(missingCount)}>
          {step.missing === null ? (
            <p className="leading-relaxed text-ink-2">Thank you. Send it to us and we’ll start building.</p>
          ) : missingCount === 1 ? (
            <p role="status" className="rounded-lg bg-rattan-wash px-4 py-3 text-rattan-ink">
              We still need {step.missing.label.charAt(0).toLowerCase()}
              {step.missing.label.slice(1)}.{" "}
              <Link href={onboardingStepHref(step.missing.step)} className="font-semibold underline underline-offset-4">
                Add it now
              </Link>
              , then send it to us here. You won’t pay again.
            </p>
          ) : (
            <p role="status" className="rounded-lg bg-rattan-wash px-4 py-3 text-rattan-ink">
              Add what is marked below, then send it to us here. You won’t pay again.
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
          <p className="leading-relaxed text-ink-2">{PLAN_ENDED_MESSAGE}</p>
          <Link href={REACTIVATE_HREF} className={`${SOFT_BUTTON} mt-3 w-fit`}>
            Go to Billing
          </Link>
        </PaymentSection>
      );
    case "under-review":
      return (
        <PaymentSection heading="Payment received">
          <p className="leading-relaxed text-ink-2">
            {PAYMENT_RECEIVED_MESSAGE} If you need us sooner, email <EmailUs />.
          </p>
        </PaymentSection>
      );
    case "no-plan":
      return (
        <PaymentSection heading="We can’t take payment just yet">
          <p className="leading-relaxed text-ink-2">
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
  const { billing, tenant } = await requireWebsiteClient();
  const snapshot = await getOnboardingSnapshot();
  const { payment } = await searchParams;
  const editable = !snapshot.locked;
  const checklist = onboardingChecklist(checklistInputFrom(snapshot));
  // Re-validated on every render, so a code retired since it was applied quietly stops discounting rather than
  // showing a price the checkout would refuse to honour.
  // Check and send pays for the website alone (startCheckoutFor), so a code is priced against it.
  const basis = billing.plan === null || billing.status !== "unpaid" ? null : codeBasisFor(WEBSITE_ALONE, billing.plan.currency);
  const discount = basis === null ? null : await resolveAppliedDiscount(tenant.businessId, basis, new Date());
  const lapsedCode = basis === null || discount !== null ? null : await findLapsedAppliedCode(tenant.businessId, basis, new Date());
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
    <PageColumns
      main={
        <>
          <p className="text-[0.84375rem] leading-relaxed text-ink-2">
            {!editable
              ? "Everything you sent us."
              : billing.status === "paid"
                ? "Look it over. Anything you want to change, edit it now, then send it to us."
                : "Everything look right? You can still change anything. Once you pay, we start building and your answers lock."}
          </p>

          {readPaymentReturn(payment) === "received" && billing.paymentUnderReview ? (
            <p role="status" className="rounded-lg bg-sunken px-4 py-3 text-sm text-ink">
              {PAYMENT_RECEIVED_MESSAGE}
            </p>
          ) : null}

          {returnView === "confirming" ? (
            <PaymentWaiting
              waitKey="review:first-payment"
              waitingText="We’ve received your payment. Confirming it with the bank…"
              delayedText="Confirming your payment is taking longer than usual."
              supportEmail={supportEmailOf(await requestBrand())}
            />
          ) : null}

          {returnView === "confirmed" ? (
            <p role="status" className="rounded-lg bg-sunken px-4 py-3 text-sm text-ink">
              Payment confirmed. Thank you.
            </p>
          ) : null}

          {returnView === "failed" && (step.kind === "pay-and-send" || step.kind === "pay") ? (
            <p role="alert" className="rounded-lg bg-sunken px-4 py-3 text-sm font-semibold text-error">
              We couldn’t confirm that payment, so nothing has been recorded. You can try again below.
            </p>
          ) : null}

          <div className={STACK}>
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
          </div>

          {/* Not while the payment just made is being confirmed: there is nothing to pay, and a second press would charge again. */}
          {returnView === "confirming" ? null : (
            <PaymentPanel
              step={step}
              checklist={checklist}
              missingCount={checklist.filter((item) => !item.passed).length}
              discount={discount}
              currency={billing.plan?.currency ?? "USD"}
              lapsedCode={lapsedCode}
              billingDetails={billingDetails}
            />
          )}
        </>
      }
      aside={<StepAside step="review" paid={billing.status === "paid"} />}
    />
  );
}
