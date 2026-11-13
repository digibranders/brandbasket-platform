import type { Metadata } from "next";
import { InvoicesScreen } from "@/features/billing/components/billing-screens";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const customer = await requireCustomer();
  return <InvoicesScreen customer={customer} />;
}
