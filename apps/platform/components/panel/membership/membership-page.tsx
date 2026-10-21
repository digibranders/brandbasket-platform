import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { FreeListingButton } from "@/components/panel/membership/free-listing-button";
import { OrderSummary } from "@/components/panel/membership/order-summary";
import { OfferCard } from "@/components/panel/membership/offer-card";
import { MembershipPayForm } from "@/components/panel/membership/membership-pay-form";
import { MembershipCheckout } from "@/components/panel/membership/membership-checkout";
import { sellsFreeListing } from "@/lib/brand";
import { MEMBER_WELCOME_HREF } from "@/lib/celebration";
import {
  MEMBER_HOME,
  isWaitingOnPayment,
  MEMBERSHIP_SERVICES_PARAM,
  membershipHrefWithServices,
  orderSummary,
  readMembershipPaymentNotice,
  type MembershipTier,
} from "@/lib/membership";
import { getCustomerBusinessEntry, isAwaitingMembership, requireCustomerAccess } from "@/lib/server/customer-access";
import { loadMembershipCheckout } from "@/lib/server/membership-checkout";
import { requestBrand } from "@/lib/server/request-brand";
import { chooseFreeListing, startMembership } from "@/app/app-host/(protected)/plan/actions";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, readBundleSelection, WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";

interface MembershipPageProps {
  readonly tier: MembershipTier;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The services named in the address (`?services=managed-website,digital-growth`), as catalogue ids only: the whole
 * subscription being bought. The website alone when it names none.
 */
function readSelectedServices(params: Readonly<Record<string, string | string[] | undefined>>): readonly MonthlyAddOnId[] {
  const raw = params[MEMBERSHIP_SERVICES_PARAM];
  const text = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const named = readBundleSelection(text.split(","));
  return named.length === 0 ? WEBSITE_ALONE : named;
}

/**
 * The plan's page, for the account a sign-up opens (docs/plans/11-platform-plans.md in the BrandBasket workspace): what
 * Managed Website includes, what it costs with any add-ons chosen, and the button that pays for it. The payment is what
 * opens the plan: the business becomes a website client and this page sends it on to its dashboard.
 *
 * An owner who chose the plan at sign-up is held here (requireCustomerAccess) and sees it without a dashboard around
 * it.
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
  const params = await searchParams;
  const notice = readMembershipPaymentNotice(params);
  // Already a member, by this payment or an earlier one: their dashboard is where they belong. Sent back from the
  // provider (`?payment=received`), it is this payment that opened the plan, so the dashboard greets them with the poppers.
  if (entry.kind !== "listing") redirect(notice === "received" ? MEMBER_WELCOME_HREF : MEMBER_HOME);

  const held = isAwaitingMembership(entry);
  const waiting = isWaitingOnPayment(billing.subscription, notice);
  // The services are named in the address, so they survive applying a code and a reload, and are paid together.
  const view = await loadMembershipCheckout({ tenant, billing }, tier, readSelectedServices(params), new Date());
  const { plan, services: selected } = view;
  const brand = await requestBrand();

  // Only an account with something to pay is shown the summary and the Pay button: one whose payment is on its way, or under
  // review, is told so by the checkout instead.
  const payable = plan !== null && !waiting && !billing.paymentUnderReview;
  const pageHref = (selection: readonly MonthlyAddOnId[]): string => membershipHrefWithServices(tier, selection);
  const lines = plan === null ? [] : bundleLines(selected, plan.currency);
  const paying = payable ? orderSummary(plan, view.discount?.amountCents ?? 0, lines) : null;

  return (
    <div className="grid gap-x-12 gap-y-8 pb-16 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:pb-0">
      <div className="min-w-0 space-y-10">
        <h1 className="sr-only">Checkout</h1>

        {/* The first-checkout offer: shown until the first payment, before the way to pay. */}
        {view.offer.kind === "available" && payable ? (
          <div className="max-w-xl">
            <OfferCard selected={selected} hrefFor={pageHref} currency={plan.currency} />
          </div>
        ) : null}

        {/* Why there is nothing to pay, when there is not: the code and the GST details are under Pay in the summary. */}
        {payable ? null : <MembershipCheckout tier={tier} view={view} notice={notice} billing={billing} includePay={false} />}
      </div>

      {/* Today's payment, following the page down beside it on a wide screen and last on a phone. */}
      {plan !== null && payable ? (
        <aside
          aria-label="Payment"
          // Following the page down, and scrolling inside itself if it is taller than the window. While the billing form is
          // open it is too tall for that to be comfortable, so the summary lets go and scrolls with the page instead.
          className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:has-[#billing-details-form]:static lg:has-[#billing-details-form]:max-h-none lg:has-[#billing-details-form]:overflow-visible"
        >
          <OrderSummary
            tier={tier}
            view={{ ...view, plan }}
            addOns={lines}
            removeHref={(addOn) => pageHref(selected.filter((id) => id !== addOn))}
          >
            <MembershipCheckout tier={tier} view={view} notice={notice} billing={billing} includePay={false} />
          </OrderSummary>
        </aside>
      ) : null}

      {/* On a phone the Pay button floats at the bottom, always in reach; the grid is its parent so it holds from the first screen. */}
      {paying === null ? null : (
        <div className="pointer-events-none sticky bottom-0 z-10 pb-4 lg:hidden">
          <div className="pointer-events-auto [&_button]:shadow-[0_10px_28px_-10px_rgb(20_20_30/0.55)]">
            <MembershipPayForm action={startMembership} amount={formatMoney(paying.totalCents, plan?.currency ?? "INR")} tier={tier} services={selected} />
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
