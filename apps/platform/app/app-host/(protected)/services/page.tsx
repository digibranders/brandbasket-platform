import type { Metadata } from "next";
import type { ReactElement } from "react";
import { AddOnRow } from "@/components/panel/add-ons/add-on-row";
import { NoticeBanner } from "@/components/panel/notice-banner";
import { PaymentWaiting } from "@/components/panel/payment-waiting";
import { ADD_ONS } from "@/lib/add-ons";
import { supportEmailOf } from "@/lib/brand";
import { CHARGE_NOTICES, readChargeNotice } from "@/lib/billing/charge-notices";
import { loadAddOnsPage } from "@/lib/server/add-ons";
import { listOpenCustomerCharges } from "@/lib/server/charges";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Services" };

interface ServicesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The services (lib/add-ons.ts: the Managed Website, Social Media and Ads, Local SEO + AEO), each billed inside the monthly payment: added here for the rest
 * of the paid month, or taken out from the next billing date. Paying for one returns here with `?charge=`: a paid one shows
 * as on in its row, so only a problem gets a notice, and while Razorpay's confirmation is still on its way the page waits for
 * it and offers no Add, so nobody pays twice.
 */
export default async function ServicesPage({ searchParams }: ServicesPageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const [page, params, openCharges, brand] = await Promise.all([
    loadAddOnsPage(customer, new Date()),
    searchParams,
    listOpenCustomerCharges(customer),
    requestBrand(),
  ]);
  const entryOf = new Map(page.addOns.map((entry) => [entry.addOn, entry] as const));
  const chargeReturn = readChargeNotice(params.charge);
  const confirming = chargeReturn === "processing" && openCharges.some((charge) => charge.kind === "add_on");
  const notice = chargeReturn === "paid" || chargeReturn === "processing" ? null : chargeReturn;

  return (
    <>
      <h1 className="panel-title">Services</h1>
      {notice === null ? null : <NoticeBanner {...CHARGE_NOTICES[notice]} />}
      {confirming ? (
        <div className="mt-6">
          <PaymentWaiting
            waitKey="add-ons:charge"
            waitingText="Thanks, we’re confirming your payment with the bank. This page updates by itself."
            delayedText="Confirming your payment is taking longer than usual."
            supportEmail={supportEmailOf(brand)}
          />
        </div>
      ) : null}
      <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
        {ADD_ONS.map((addOn) => {
          const entry = entryOf.get(addOn.id);
          return entry === undefined ? null : <AddOnRow key={addOn.id} addOn={addOn} entry={entry} canAdd={!confirming} />;
        })}
      </ul>
    </>
  );
}
