import type { ReactElement } from "react";
import { EmailUs } from "@/components/panel/email-us";
import { MembershipCheckout } from "@/components/panel/membership/membership-checkout";
import { PlanComparisonTable } from "@/components/panel/upgrade/plan-comparison-table";
import { sellsFreeListing, type Brand } from "@/lib/brand";
import { UpgradePlans, type PlanCardView } from "@/components/panel/upgrade/upgrade-plans";
import { isWaitingOnPayment, MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/membership";
import { planCardBase } from "@/lib/plan-cards";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import { loadMembershipCheckout, type MembershipCheckoutView } from "@/lib/server/membership-checkout";
import { requestBrand } from "@/lib/server/request-brand";
import { planPaymentSummary } from "@/lib/upgrade-summary";

const BUTTON_LABELS: Readonly<Record<MembershipTier, string>> = { care: "Choose Care plan", premium: "Go Premium" };

function cardFor(tier: MembershipTier, view: MembershipCheckoutView, billing: GrantedCustomer["billing"], brand: Brand): PlanCardView {
  const { plan, discount } = view;
  const base = planCardBase(tier, plan, brand);
  if (plan === null) {
    return {
      ...base,
      action: {
        kind: "note",
        note: (
          <>
            We can&rsquo;t take payment for this plan just yet. Email us at{" "}
            <EmailUs />{" "}
            and we&rsquo;ll sort it out.
          </>
        ),
      },
    };
  }
  return {
    ...base,
    action: {
      kind: "buy",
      label: BUTTON_LABELS[tier],
      summaryLabel: base.name,
      summary: planPaymentSummary(plan, discount?.amountCents ?? 0),
      checkout: <MembershipCheckout tier={tier} view={view} notice={null} billing={billing} />,
    },
  };
}

/**
 * The Upgrade page for a free listing account: Care and Premium side by side, each with the way to buy it, and the
 * table that compares them with the free listing it is on now. Buying either is the same checkout its own page has
 * (components/panel/membership/membership-checkout.tsx), so a code or invoice details work the same here.
 *
 * An account whose payment is on its way, or under review, is told so instead of being offered a plan to buy.
 */
export async function FreeUpgrade({ customer }: { readonly customer: GrantedCustomer }): Promise<ReactElement> {
  const { billing } = customer;
  const brand = await requestBrand();
  const showFree = sellsFreeListing(brand);
  const now = new Date();
  const [care, premium] = await Promise.all(MEMBERSHIP_TIERS.map((tier) => loadMembershipCheckout(customer, tier, now)));
  if (care === undefined || premium === undefined) throw new Error("Both plans' checkouts are read for the Upgrade page");

  return (
    <>
      <h1 className="panel-title">
        Pick a <em>plan.</em>
      </h1>
      <p className="mt-3 text-ink-soft">{showFree ? "Compare Free, Care and Premium." : "Compare Care and Premium."}</p>

      <div className="mt-10">
        {billing.paymentUnderReview || isWaitingOnPayment(billing.subscription, null) ? (
          <div className="max-w-xl">
            <MembershipCheckout tier="premium" view={premium} notice={null} billing={billing} />
          </div>
        ) : (
          <UpgradePlans cards={[cardFor("care", care, billing, brand), cardFor("premium", premium, billing, brand)]} />
        )}
      </div>

      <PlanComparisonTable yours="free" brand={brand} />
    </>
  );
}
