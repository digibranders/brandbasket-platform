import type { Metadata } from "next";
import { CheckoutScreen } from "@/features/checkout/components/checkout-screen";
import { loadCheckout } from "@/features/checkout/loader";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Checkout" };

/**
 * The first payment: for the account a sign-up opened (held here and on /start until it pays) and for a website client invited
 * by staff. `?services=` names the basket; `?payment=received|failed` is where Razorpay's return lands. loadCheckout sends a
 * business that has paid Home and a lapsed one to Plan & billing.
 */
export default async function CheckoutPage({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  const customer = await requireCustomer();
  return <CheckoutScreen view={await loadCheckout(customer, await searchParams)} />;
}
