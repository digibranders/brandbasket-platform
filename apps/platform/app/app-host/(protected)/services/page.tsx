import type { Metadata } from "next";
import type { ReactElement } from "react";
import { AddOnRow } from "@/components/panel/add-ons/add-on-row";
import { ServicesGlance } from "@/components/panel/add-ons/services-glance";
import { NoticeBanner } from "@/components/panel/notice-banner";
import { PaymentWaiting } from "@/components/panel/payment-waiting";
import { PageFrame } from "@/components/v2/page";
import { SectionTabs } from "@/components/v2/section-tabs";
import { ownedFirst } from "@/lib/plan/order";
import { PLAN_TABS } from "@/lib/plan/tabs";
import { ADD_ONS } from "@/lib/add-ons";
import { supportEmailOf } from "@/lib/brand";
import { servicesGlance } from "@/lib/billing/added-service";
import { CHARGE_NOTICES, readChargeNotice } from "@/lib/billing/charge-notices";
import { hasAddedServiceAwaitingPayment, loadAddOnsPage } from "@/lib/server/add-ons";
import { listOpenCustomerCharges } from "@/lib/server/charges";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Plan & billing" };

interface ServicesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The services (lib/add-ons.ts: the Managed Website, Social Media and Ads, Local SEO + AEO), each billed inside the monthly payment: added here
 * (on a monthly plan as one combined subscription that moves the billing date, otherwise for the rest of the paid month), or taken out
 * from the next billing date. A strip at the top gives the next payment and how many of the three plans are held; each service is a tile. Paying for one returns here with `?charge=`: a paid one shows
 * as on in its row, so only a problem gets a notice, and while Razorpay's confirmation is still on its way the page waits for
 * it and offers no Add, so nobody pays twice.
 */
export default async function ServicesPage({ searchParams }: ServicesPageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", access: "owner" });
  const [page, params, openCharges, brand, addAwaitingPayment] = await Promise.all([
    loadAddOnsPage(customer, new Date()),
    searchParams,
    listOpenCustomerCharges(customer),
    requestBrand(),
    hasAddedServiceAwaitingPayment(customer),
  ]);
  const chargeReturn = readChargeNotice(params.charge);
  // Only on the way back from paying (?charge=processing): an abandoned approval must not block Add. Pressing Add again is
  // safe anyway, as startCombinedAddOn asks Razorpay whether the earlier one was paid before replacing it.
  const confirming = chargeReturn === "processing" && (openCharges.some((charge) => charge.kind === "add_on") || addAwaitingPayment);
  const notice = chargeReturn === "paid" || chargeReturn === "processing" ? null : chargeReturn;
  const glance = servicesGlance({ subscription: customer.billing.subscription, plan: customer.billing.plan, entries: page.addOns, now: new Date() });

  return (
    <PageFrame title="Plan & billing" lede="Your services first, then the ones you could add." tabs={<SectionTabs tabs={PLAN_TABS} label="Plan and billing" />}>
      {notice === null && !confirming ? null : (
        <div className="grid gap-6">
          {notice === null ? null : <NoticeBanner {...CHARGE_NOTICES[notice]} />}
          {confirming ? (
            <PaymentWaiting
              waitKey="add-ons:charge"
              waitingText="Thanks, we’re confirming your payment with the bank. This page updates by itself."
              delayedText="Confirming your payment is taking longer than usual."
              supportEmail={supportEmailOf(brand)}
            />
          ) : null}
        </div>
      )}
      {glance === null ? null : <ServicesGlance glance={glance} />}
      <ul className="grid gap-4 @2xl:grid-cols-2">
        {ownedFirst(ADD_ONS, page.addOns).map((entry) => {
          const addOn = ADD_ONS.find((candidate) => candidate.id === entry.addOn);
          return addOn === undefined ? null : (
            <AddOnRow
              key={addOn.id}
              addOn={addOn}
              entry={entry}
              canAdd={!confirming}
              plansHeld={glance === null ? null : { held: glance.plansHeld, total: glance.plansTotal }}
            />
          );
        })}
      </ul>
    </PageFrame>
  );
}
