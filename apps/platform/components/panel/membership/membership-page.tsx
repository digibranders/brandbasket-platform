import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { TickIcon } from "@fynix/shared/ui/icons";
import { FreeListingButton } from "@/components/panel/membership/free-listing-button";
import { OfferCard } from "@/components/panel/membership/offer-card";
import { MembershipCheckout } from "@/components/panel/membership/membership-checkout";
import { PlanMark } from "@/components/panel/plan-mark";
import { offersChoice, sellsFreeListing } from "@/lib/brand";
import { MEMBER_WELCOME_HREF } from "@/lib/celebration";
import {
  MEMBER_HOME,
  UPGRADE_PATH,
  groupedBenefits,
  isWaitingOnPayment,
  membershipPathFor,
  membershipPriceParts,
  plansMoveToUpgradePage,
  readMembershipPaymentNotice,
  type MembershipTier,
} from "@/lib/membership";
import { getCustomerBusinessEntry, isAwaitingMembership, requireCustomerAccess } from "@/lib/server/customer-access";
import { loadMembershipCheckout } from "@/lib/server/membership-checkout";
import { requestBrand } from "@/lib/server/request-brand";
import { addOfferAddOn, chooseFreeListing } from "@/app/app-host/(protected)/premium/actions";

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

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <h1 className="panel-title">{HEADINGS[tier](brand.shortName)}</h1>

        {/* What the plan holds, sorted into the three layers it stacks. */}
        <div className="mt-8 max-w-xl space-y-7">
          {groups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h2 className="panel-section">{group.name}</h2>
              <ul className="mt-1 divide-y divide-line border-y border-line">
                {group.items.map((benefit) => (
                  <li key={benefit} className="flex items-baseline gap-3 py-2.5 text-[0.9375rem]">
                    <TickIcon className="size-4 shrink-0 translate-y-[0.2rem] text-success" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {offersChoice(brand, other.tier) ? (
          <p className="mt-5 max-w-xl text-sm text-ink-soft">
            <Link href={membershipPathFor(other.tier)} className="link-underline">
              {other.line}
            </Link>
          </p>
        ) : null}
      </div>

      {/* The plan's price, beside what it includes. */}
      <div className="h-fit">
        {price === null ? null : (
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <PlanMark tier={tier} className="size-5" />
              {tier === "premium" ? "Premium" : "Care"}
            </p>
            <p className={`mt-3 font-serif text-5xl tabular-nums ${tier === "premium" ? "text-gold-deep" : "text-accent"}`}>{price.amount}</p>
            {price.was === null ? null : (
              <p className="text-sm text-ink-soft">
                <s>{price.was}</s> before your discount
              </p>
            )}
            <p className="text-sm text-ink-soft">{price.terms}</p>
          </div>
        )}
      </div>

      {/* The first-checkout offer, then the way to pay (a code, the invoice details and the Pay bar), in one container so the Pay bar can stay on screen. */}
      <div aria-label="Payment" role="group" className="space-y-10 lg:col-span-2">
        {view.offer.kind === "available" && !waiting && !billing.paymentUnderReview ? (
          <OfferCard action={addOfferAddOn} claimed={view.offer.claimed} />
        ) : null}
        <MembershipCheckout tier={tier} view={view} notice={notice} billing={billing} />
      </div>

      {/* Not while we wait to hear about a payment just made: the plan is about to open. */}
      {held && sellsFreeListing(brand) && (!waiting || billing.paymentUnderReview) ? (
        <form action={chooseFreeListing} className="max-w-xl border-t border-line pt-6 lg:col-span-2">
          <FreeListingButton />
        </form>
      ) : null}
    </div>
  );
}
