import { isPhoneAccountEmail } from "@brandbasket/db";
import type { Metadata } from "next";
import { loadFirstPaymentEvent } from "@/features/conversions/first-payment-event";
import { HomeScreen, HomeStateError } from "@/features/home/components/home-screen";
import { loadHomePanels, loadHomeState } from "@/features/home/loader";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Home" };

interface HomePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * Home follows the customer's real state (features/home/rules.ts): a payment problem, the kickoff, the website being built
 * and reviewed, or the service a month in. When the read that decides the state fails, the page says so and guesses nothing.
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  const customer = await requireCustomer();
  const now = new Date();
  const state = await loadHomeState(customer, now);
  if (!state.ok) return <HomeStateError failure={state.error} name={customer.user.name} now={now} />;
  const view = state.data;
  // Only the welcome visit (exactly ?welcome=1, from the payment confirmation) reads the first payment for Tag Manager.
  const welcome = (view.state.kind === "kickoff_unbooked" || view.state.kind === "kickoff_booked") && (await searchParams).welcome === "1";
  const [panels, purchase] = await Promise.all([loadHomePanels(customer, view, now), welcome ? loadFirstPaymentEvent(customer.tenant) : Promise.resolve(null)]);
  return (
    <HomeScreen
      person={{ name: customer.user.name, isPhoneAccount: isPhoneAccountEmail(customer.user.email), role: customer.role }}
      services={customer.services}
      view={view}
      panels={panels}
      now={now}
      purchase={purchase?.ok === true ? purchase.data : null}
    />
  );
}
