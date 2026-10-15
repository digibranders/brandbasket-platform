import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { formatMoney } from "@fynix/shared/lib/money";
import { FreeListingButton } from "@/components/panel/membership/free-listing-button";
import { OrderSummary } from "@/components/panel/membership/order-summary";
import { OfferCard } from "@/components/panel/membership/offer-card";
import { MembershipPayForm } from "@/components/panel/membership/membership-pay-form";
import { MembershipCheckout } from "@/components/panel/membership/membership-checkout";
import { offersChoice, sellsFreeListing } from "@/lib/brand";
import { MEMBER_WELCOME_HREF } from "@/lib/celebration";
import {
  MEMBER_HOME,
  UPGRADE_PATH,
  groupedBenefits,
  isWaitingOnPayment,
  membershipPathFor,
  membershipPriceParts,
  orderSummary,
  plansMoveToUpgradePage,
  readMembershipPaymentNotice,
  type MembershipTier,
} from "@/lib/membership";
import { getCustomerBusinessEntry, isAwaitingMembership, requireCustomerAccess } from "@/lib/server/customer-access";
import { loadMembershipCheckout } from "@/lib/server/membership-checkout";
import { requestBrand } from "@/lib/server/request-brand";
import { addOfferAddOn, chooseFreeListing, startMembership } from "@/app/app-host/(protected)/premium/actions";

interface MembershipPageProps {
  readonly tier: MembershipTier;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

const HEADINGS: Readonly<Record<MembershipTier, (brandName: string) => ReactElement>> = {
  care: (brandName) => (
    <>
      {brandName} <em>Care.</em>
    </>
  ),
  premium: () => (
    <>
      Premium <em>membership.</em>
    </>
  ),
};

/** The other plan, for the line under the list: what a person reading this one may want to compare it with. */
const OTHER: Readonly<Record<MembershipTier, { readonly tier: MembershipTier; readonly line: string }>> = {
  care: { tier: "premium", line: "Want appointments and marketing handled too? See Premium." },
  premium: { tier: "care", line: "Only need the website, chatbot and hosting? See Care." },
};

/**
 * One plan's page, for a free listing account (docs/superpowers/specs/2026-09-30-single-entry-premium-design.md,
 * 2026-10-07-care-plan-design.md): what it includes, what it costs, and the button that pays for it. The payment is what
 * opens the plan: the business becomes a website client and this page sends it on to its dashboard.
 *
 * An owner who chose the plan at sign-up is held here (requireCustomerAccess) and sees it without a dashboard around
 * it, with a way to carry on free instead. Any other free listing account is sent on to the Upgrade page, which
 * shows both plans (app/app-host/(protected)/upgrade).
 *
 * A coupon or an affiliate code may be applied before paying; the Pay button then shows the discounted price, worked
 * out by the same function checkout freezes it with, against this page's own plan.
 *
 * Back from Razorpay the confirmation may not have reached us yet: `?payment=received` says so and keeps checking,
 * for as long as the account really has a checkout that has not settled (unsettledCheckout).
 */
export async function MembershipPage({ tier, searchParams }: MembershipPageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const entry = await getCustomerBusinessEntry(tenant.userId, tenant.businessId);
  const notice = readMembershipPaymentNotice(await searchParams);
  // Already a member, by this payment or an earlier one: their dashboard is where they belong. Sent back from the
  // provider (`?payment=received`), it is this payment that opened the plan, so the dashboard greets them with the poppers.
  if (entry.kind !== "listing") redirect(notice === "received" ? MEMBER_WELCOME_HREF : MEMBER_HOME);

  const held = isAwaitingMembership(entry);
  const waiting = isWaitingOnPayment(billing.subscription, notice);
  // A plan's page opened from the dashboard is the Upgrade page's job now: it shows both plans and the way to pay. This
  // page stays for the owner held on their plan, a payment's return address, and a payment still being settled.
  if (plansMoveToUpgradePage({ held, notice, waiting, paymentUnderReview: billing.paymentUnderReview })) redirect(UPGRADE_PATH);
  const view = await loadMembershipCheckout({ tenant, billing }, tier, new Date());
  const { plan } = view;
  const other = OTHER[tier];
  const brand = await requestBrand();

  const groups = groupedBenefits(tier, brand);
  // What the plan costs this business: the list price less a code's share. The lifetime offer is on the add-ons, not the plan.
  const price = plan === null ? null : membershipPriceParts(plan, view.discount?.amountCents ?? 0);

  // Only an account with something to pay is shown the summary and the Pay button: one whose payment is on its way, or under
  // review, is told so by the checkout instead.
  const payable = plan !== null && !waiting && !billing.paymentUnderReview;
  const paying = payable ? orderSummary(plan, view.discount?.amountCents ?? 0) : null;

  return (
    <div className="grid gap-x-12 gap-y-8 pb-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:pb-0">
      <div className="min-w-0 space-y-10">
        <div>
          <h1 className="panel-title">{HEADINGS[tier](brand.shortName)}</h1>
          {price === null ? null : (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-ink-soft">
              <span className={`font-serif text-3xl tabular-nums ${tier === "premium" ? "text-gold-deep" : "text-accent"}`}>{price.amount}</span>
              {price.was === null ? null : <s className="text-sm">{price.was}</s>}
              <span className="text-sm">{price.terms}</span>
            </p>
          )}
        </div>

        {offersChoice(brand, other.tier) ? (
          <p className="max-w-xl text-sm text-ink-soft">
            <Link href={membershipPathFor(other.tier)} className="link-underline">
              {other.line}
            </Link>
          </p>
        ) : null}

        {/* The first-checkout offer: shown until the first payment, before the way to pay. */}
        {view.offer.kind === "available" && payable ? <OfferCard action={addOfferAddOn} claimed={view.offer.claimed} /> : null}

        {/* Why there is nothing to pay, when there is not: the code and the GST details are under Pay in the summary. */}
        {payable ? null : <MembershipCheckout tier={tier} view={view} notice={notice} billing={billing} includePay={false} />}
      </div>

      {/* Today's payment, following the page down beside it on a wide screen and last on a phone. */}
      {plan !== null && payable ? (
        <aside aria-label="Payment" className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain">
          <OrderSummary tier={tier} view={{ ...view, plan }} groups={groups}>
            <MembershipCheckout tier={tier} view={view} notice={notice} billing={billing} includePay={false} />
          </OrderSummary>
        </aside>
      ) : null}

      {/* On a phone the Pay button floats at the bottom, always in reach; the grid is its parent so it holds from the first screen. */}
      {paying === null ? null : (
        <div className="pointer-events-none sticky bottom-0 z-10 pb-4 lg:hidden">
          <div className="pointer-events-auto [&_button]:shadow-[0_10px_28px_-10px_rgb(20_20_30/0.55)]">
            <MembershipPayForm action={startMembership} amount={formatMoney(paying.totalCents, plan?.currency ?? "INR")} tier={tier} />
          </div>
        </div>
      )}

      {/* Not while we wait to hear about a payment just made: the plan is about to open. */}
      {held && sellsFreeListing(brand) && (!waiting || billing.paymentUnderReview) ? (
        <form action={chooseFreeListing} className="max-w-xl border-t border-line pt-6 lg:col-span-2">
          <FreeListingButton />
        </form>
      ) : null}
    </div>
  );
}
