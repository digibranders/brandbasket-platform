import { redirect } from "next/navigation";
import { EmailUs } from "@/components/panel/email-us";
import type { ReactElement } from "react";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import { nextBundledNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { BillingDetails } from "@/components/panel/billing/billing-details";
import { PlanComparisonTable } from "@/components/panel/upgrade/plan-comparison-table";
import { UpgradePayForm } from "@/components/panel/upgrade/upgrade-pay-form";
import { UpgradePlans, type PlanCardView } from "@/components/panel/upgrade/upgrade-plans";
import { MEMBER_HOME } from "@/lib/membership";
import { planCardBase } from "@/lib/plan-cards";
import { loadBillingDetailsView } from "@/lib/server/billing-details";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import { readUpgradePage } from "@/lib/server/plan-upgrade";
import { requestBrand } from "@/lib/server/request-brand";
import { upgradePaymentSummary } from "@/lib/upgrade-summary";
import { BLOCK_MESSAGES, PAYMENT_NOTICES, readPaymentNotice, UNAVAILABLE_MESSAGES, upgradeScreen, upgradeStanding } from "@/lib/upgrade-view";
import { startUpgrade } from "@/app/app-host/(protected)/upgrade/actions";

interface CareUpgradeProps {
  readonly customer: GrantedCustomer;
  readonly payment: string | string[] | undefined;
}

/**
 * The Upgrade page for a Care client (docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-design.md): their own
 * plan marked as theirs beside Premium, and the move up. They pay the difference for the days left of the month they
 * have already paid for, and Premium's full price starts at the next renewal. What is shown is worked out fresh from the
 * database on every render; the Pay button works it out again on the server, so a page left open for a day cannot buy a
 * stale price.
 *
 * Back from the payment the confirmation may not have reached us yet: `?payment=processing` says so, and the page holds
 * back its Pay button while the charge it would pay is still open, so nobody pays the same upgrade twice.
 */
export async function CareUpgrade({ customer, payment }: CareUpgradeProps): Promise<ReactElement> {
  const brand = await requestBrand();
  const page = await readUpgradePage(customer, new Date());
  if (page === null) return <p className="text-sm text-ink-soft">We couldn’t find your plan. Email us and we’ll sort it out.</p>;
  const { assessment, inFlight } = page;
  const notice = readPaymentNotice(payment);
  const screen = upgradeScreen({ assessment, inFlightStatus: inFlight?.status ?? null, notice });
  // Already Premium by the first payment, or by staff: their dashboard is where they belong.
  if (screen.kind === "home") redirect(MEMBER_HOME);

  // Once a move is paid for the billing state already shows the plan they moved to, so Care's own card is priced from the plan
  // the subscription is still billed on, and "your plan" is Premium (lib/upgrade-view.ts upgradeStanding).
  const standing = upgradeStanding(screen);
  const onPremium = standing.yours === "premium";
  const carePlan = page.billedPlan?.tier === "care" ? page.billedPlan : customer.billing.tier === "care" ? customer.billing.plan : null;
  const careBase = planCardBase("care", carePlan, brand);
  const care: PlanCardView = {
    ...careBase,
    action: onPremium
      ? { kind: "note", note: <p>You were on Care. Premium has taken its place.</p> }
      : { kind: "current", manageHref: "/billing" },
  };

  let premium: PlanCardView;
  let intro: ReactElement | null = null;
  if (screen.kind === "offer" && assessment.kind === "offer") {
    const { quote, premium: premiumPlan, carry, retentionEnds } = assessment;
    const base = planCardBase("premium", premiumPlan, brand);
    intro = (
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
        You’ve paid for Care until <LocalDate iso={assessment.periodEnd.toISOString()} />. Premium opens today for the days that are
        left; you pay only the difference for them.
      </p>
    );
    if (screen.waiting) {
      premium = {
        ...base,
        action: { kind: "note", note: <p role="status">We’re confirming your payment. Reload this page in a minute.</p> },
      };
    } else {
      // Only where there is something to pay: a move up that costs nothing today has no invoice to put a name on.
      const billingDetails = quote.free ? null : await loadBillingDetailsView(customer);
      premium = {
        ...base,
        action: {
          kind: "buy",
          label: "Upgrade to Premium",
          summaryLabel: "Premium for the days left",
          summary: upgradePaymentSummary(quote, premiumPlan),
          afterwards: (
            <>
              Then {formatMoney(quote.nextRenewalCents, premiumPlan.currency)} a month from <LocalDate iso={assessment.periodEnd.toISOString()} />, with
              GST.
              {carry.kind === "carried" && carry.amountCents > 0
                ? ` Your code ${carry.code} comes with you: ${formatMoney(carry.amountCents, premiumPlan.currency)} off Premium every month.`
                : ""}
              {carry.kind === "dropped" ? ` Your code ${carry.code} isn’t available for Premium, so it’s Premium’s full price.` : ""}
              {retentionEnds ? " The discount we gave you to stay was for Care, so it ends when you move up." : ""}
            </>
          ),
          checkout: (
            <div className="space-y-5">
              {billingDetails === null ? null : <BillingDetails view={billingDetails} variant="checkout" />}
              <UpgradePayForm action={startUpgrade} amount={quote.free ? null : upgradePaymentSummary(quote, premiumPlan).total} />
              <p className="text-sm leading-relaxed text-ink-soft">
                Nothing is refunded if you leave later. Need to talk it over first? Email <EmailUs />.
              </p>
            </div>
          ),
        },
      };
    }
  } else if (screen.kind === "moving") {
    const { plan, subscription } = customer.billing;
    const amount = plan === null || subscription === null ? null : renewalCharge(plan, subscription.discountAmountCents, nextBundledNetCents(subscription));
    intro = (
      <>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
          {amount !== null && subscription?.paidThroughAt != null ? (
            <>
              Your move up is paid for. Your next payment is {amount} on <LocalDate iso={subscription.paidThroughAt.toISOString()} />, and
              it’s Premium’s price from then on.
            </>
          ) : (
            <>Your move up is paid for. Premium’s full price starts at your next renewal.</>
          )}
        </p>
        {screen.finishing ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">We’re finishing the change with our payment provider. Nothing for you to do.</p>
        ) : null}
      </>
    );
    premium = { ...planCardBase("premium", plan, brand), action: { kind: "current", manageHref: "/billing" } };
  } else if (screen.kind === "blocked") {
    premium = {
      ...planCardBase("premium", null, brand),
      action: {
        kind: "note",
        note: (
          <>
            {BLOCK_MESSAGES[screen.reason]} <EmailUs />
          </>
        ),
      },
    };
  } else if (screen.kind === "unavailable") {
    premium = {
      ...planCardBase("premium", null, brand),
      action: {
        kind: "note",
        note: (
          <>
            {UNAVAILABLE_MESSAGES[screen.reason]} <EmailUs />
          </>
        ),
      },
    };
  } else {
    throw new Error(`Unhandled upgrade screen: ${screen.kind}`);
  }

  return (
    <>
      <h1 className="panel-title">
        {onPremium ? (
          <>
            You’re on <em>Premium.</em>
          </>
        ) : (
          <>
            Move up to <em>Premium.</em>
          </>
        )}
      </h1>
      {onPremium ? null : <p className="mt-3 text-ink-soft">You are on the Care plan.</p>}
      {intro}
      {notice === null ? null : (
        <p
          role="status"
          className={`mt-6 max-w-xl rounded-control px-4 py-3 text-sm ${PAYMENT_NOTICES[notice].ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}
        >
          {PAYMENT_NOTICES[notice].text}
        </p>
      )}

      <div className="mt-10">
        <UpgradePlans cards={[care, premium]} />
      </div>

      <PlanComparisonTable yours={standing.yours} brand={brand} />
    </>
  );
}
