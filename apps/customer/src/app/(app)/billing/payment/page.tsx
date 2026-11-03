import type { Metadata } from "next";
import { PaymentScreen } from "@/features/billing/components/billing-screens";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Payment and details" };

export default async function PaymentPage() {
  const customer = await requireCustomer();
  return <PaymentScreen customer={customer} />;
}
