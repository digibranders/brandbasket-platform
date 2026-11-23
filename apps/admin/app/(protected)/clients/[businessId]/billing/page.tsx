import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { staffCan } from "@brandbasket/shared/lib/access";
import { ClientAddOns } from "@/components/client-add-ons";
import { readAddOnNotice } from "@/lib/add-on-notices";
import { clientTabHref, forwardedNoticeHref } from "@/lib/client-tabs";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { openClientTab } from "@/lib/server/client-page";
import { BillingSection } from "./billing-section";

export const metadata: Metadata = { title: "Client money" };

export default async function ClientMoneyPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "billing");
  const sp = await searchParams;
  // The figures, chatbot and legacy actions still redirect here with their notice; the Services tab shows it.
  const forward = forwardedNoticeHref(client.businessId, sp);
  if (forward !== null && !forward.startsWith(clientTabHref(client.businessId, "billing"))) redirect(forward);

  const clientAddOns = await loadClientAddOns(client.businessId, new Date());
  const planLines = (
    <ClientAddOns
      businessId={client.businessId}
      addOns={clientAddOns.addOns}
      bundledAddOns={clientAddOns.bundledAddOns}
      pressReleases={clientAddOns.pressReleases}
      options={clientAddOns.options}
      notice={readAddOnNotice(sp.addOns)}
      keptStartsOn={clientAddOns.keptStartsOn}
    />
  );

  // Money holds money only: no Package or Ad credit rows (packageFacts null). Roles without the capability see the plan lines alone.
  return staffCan(granted.staff.role, "money") ? (
    <BillingSection client={client} query={sp} packageFacts={null} afterPayments={planLines} />
  ) : (
    planLines
  );
}
