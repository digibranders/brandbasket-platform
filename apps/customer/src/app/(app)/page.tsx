import { isPhoneAccountEmail } from "@brandbasket/db";
import { publicVapidKey } from "@brandbasket/shared/lib/push-device";
import type { Metadata } from "next";
import { loadFirstPaymentEvent } from "@/features/conversions/first-payment-event";
import { PushPrompt } from "@/features/home/components/push-prompt";
import { WelcomeDialog } from "@/features/home/components/welcome-dialog";
import { HomeScreen, HomeStateError } from "@/features/home/components/home-screen";
import { loadHomePanels, loadHomeState } from "@/features/home/loader";
import { loadIntake } from "@/features/start/server";
import { loadBusinessEntry } from "@/features/checkout/server/entry";
import { requireCustomer, type CustomerContext } from "@/lib/guards";

export const metadata: Metadata = { title: "Home" };

interface HomePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Whether the welcome dialog should send this business to the short questions: it signed up and paid here, and has not finished them. */
async function loadWelcomeQuestionsOpen(customer: CustomerContext): Promise<boolean> {
  const entry = await loadBusinessEntry(customer);
  if (entry.signupChoice !== "managed") return false;
  return (await loadIntake(customer.tenant)).completedAt === null;
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
  const [panels, purchase, questionsOpen] = await Promise.all([
    loadHomePanels(customer, view, now),
    welcome ? loadFirstPaymentEvent(customer.tenant) : Promise.resolve(null),
    // The welcome visit also reads whether the short questions are done: the welcome dialog sends them there only when they are not.
    welcome ? loadWelcomeQuestionsOpen(customer) : Promise.resolve(false),
  ]);
  // The prompt waits for a paid plan: while a payment is due, under review or lapsed, Home has one job.
  const paid = view.state.kind !== "payment_required" && view.state.kind !== "payment_processing" && view.state.kind !== "lapsed";
  return (
    <>
      {welcome && questionsOpen ? <WelcomeDialog questionsOpen /> : null}
      {paid ? <PushPrompt publicKey={publicVapidKey(process.env)} /> : null}
      <HomeScreen
        person={{ name: customer.user.name, isPhoneAccount: isPhoneAccountEmail(customer.user.email), role: customer.role }}
        services={customer.services}
        view={view}
        panels={panels}
        now={now}
        purchase={purchase?.ok === true ? purchase.data : null}
      />
    </>
  );
}
