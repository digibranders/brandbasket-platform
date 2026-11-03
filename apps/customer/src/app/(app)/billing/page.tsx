import type { Metadata } from "next";
import { BillingScreen } from "@/features/billing/components/billing-screens";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Plan & billing" };

/** Plan & billing in every billing state: a lapsed or unpaid customer must reach it to pay. */
export default async function BillingPage({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  const customer = await requireCustomer();
  return <BillingScreen customer={customer} params={await searchParams} />;
}
