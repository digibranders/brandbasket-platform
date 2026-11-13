import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { AdsView } from "@/components/ads/ads-view";
import { loadAds } from "@/lib/server/ads";
import { loadActiveServices } from "@/lib/server/active-services";
import { requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Ads" };

/** The business's own ad figures and campaigns, as staff entered them. The business comes from the session. */
export default async function AdsPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  // This is for paid accounts; the home page tells the rest what is next.
  if (!billing.hasAccess) redirect("/");
  // Not bought: Your plan is where the service is added.
  if (!(await loadActiveServices(tenant)).includes("social")) redirect(ADD_ONS_PATH);
  return <AdsView data={await loadAds(tenant, billing.plan?.currency ?? "INR", new Date())} />;
}
