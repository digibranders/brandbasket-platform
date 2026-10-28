import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { FreeListingButton } from "@/components/panel/membership/free-listing-button";
import { CheckoutLedger } from "@/components/panel/membership/checkout-ledger";
import { MembershipCheckout } from "@/components/panel/membership/membership-checkout";
import { STACK } from "@/components/v2/classes";
import { sellsFreeListing } from "@/lib/brand";
import { MEMBER_WELCOME_HREF } from "@/lib/celebration";
import {
  MEMBER_HOME,
  isWaitingOnPayment,
  MEMBERSHIP_SERVICES_PARAM,
  readMembershipPaymentNotice,
  type MembershipTier,
} from "@/lib/membership";
import { getCustomerBusinessEntry, isAwaitingMembership, requireCustomerAccess } from "@/lib/server/customer-access";
import { loadMembershipCheckout } from "@/lib/server/membership-checkout";
import { requestBrand } from "@/lib/server/request-brand";
import { chooseFreeListing } from "@/app/app-host/(protected)/plan/actions";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection, WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";

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
 * The plan's page, for the account a sign-up opens (docs/plans/11-platform-plans.md in the BrandBasket workspace): the
 * services in the basket (the website, Social Media and Ads, Local SEO + AEO, one to three), what they cost together, and
 * the button that pays for them. The payment is what opens the plan: the business becomes a website client and this page
 * sends it on to its dashboard.
 *
 * An owner who chose the plan at sign-up is held here (requireCustomerAccess) and sees it without a dashboard around
 * it.
 *
 * The services are chosen on the page itself (checkout-ledger.tsx), which prices every choice in the browser with the
 * functions checkout charges by; the address here only says where the choice starts. A coupon or an affiliate code may be
 * applied before paying; the Pay button then shows the discounted price.
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

  // Only an account with something to pay is shown the choice and the Pay button: one whose payment is on its way, or under
  // review, is told so by the checkout instead.
  const payable = plan !== null && !waiting && !billing.paymentUnderReview;

  return (
    <div className={STACK}>
      {payable ? (
        <CheckoutLedger
          tier={tier}
          initialServices={selected}
          choosable={view.offer.kind === "available"}
          pricing={{
            planInitialAmountCents: plan.initialAmountCents,
            currency: plan.currency,
            taxRateBasisPoints: plan.taxRateBasisPoints,
            forfeited: view.forfeited,
            hasEverPaid: view.hasEverPaid,
          }}
          initialTermMonths={plan.initialTermMonths}
          code={view.discount === null ? null : { code: view.discount.code, stated: view.discount.stated, months: view.discount.months }}
          lapsedCode={view.lapsedCode}
          billingDetails={view.billingDetails}
          paymentFailed={notice === "failed"}
        />
      ) : (
        <div className="max-w-xl">
          <h1 className="sr-only">Checkout</h1>
          <MembershipCheckout view={view} notice={notice} billing={billing} />
        </div>
      )}

      {/* Not while we wait to hear about a payment just made: the plan is about to open. */}
      {held && sellsFreeListing(brand) && (!waiting || billing.paymentUnderReview) ? (
        <form action={chooseFreeListing} className="max-w-xl">
          <FreeListingButton />
        </form>
      ) : null}
    </div>
  );
}
