import type { Metadata } from "next";
import type { ReactElement } from "react";
import { AddOnRow } from "@/components/panel/add-ons/add-on-row";
import { ADD_ONS } from "@/lib/add-ons";
import { loadAddOnsPage } from "@/lib/server/add-ons";
import { requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Add-ons" };

/**
 * Digital Growth and Local SEO + AEO (lib/add-ons.ts). One chosen with the plan is billed inside its monthly payment and can
 * be taken out here from the next billing date; one that is not shows its price and how to ask for it.
 */
export default async function AddOnsPage(): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const page = await loadAddOnsPage(customer);
  const entryOf = new Map(page.addOns.map((entry) => [entry.addOn, entry] as const));

  return (
    <>
      <h1 className="panel-title">Add-ons</h1>
      <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
        {ADD_ONS.map((addOn) => {
          const entry = entryOf.get(addOn.id);
          return entry === undefined ? null : <AddOnRow key={addOn.id} addOn={addOn} entry={entry} />;
        })}
      </ul>
    </>
  );
}
