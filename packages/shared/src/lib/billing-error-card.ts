import { teamsCard, type TeamsMessage } from "./teams-webhook";

/*
 * The Teams card for a billing error (the billing log's error lines). The log fields are already free of customer details, so the card
 * carries them as they are: what failed, for which business, and the error's name and codes.
 */

/** Plain words for the events that can reach here. An event not listed falls back to its own name. */
const WHAT_HAPPENED: Readonly<Record<string, string>> = {
  "webhook-processing-failed": "A payment event from Razorpay could not be processed. Razorpay will deliver it again; check it goes through.",
  "checkout-orphaned": "A checkout opened at Razorpay could not be recorded here. Check the customer is not left paying for nothing.",
  "provider-cancel-failed": "A subscription we no longer want could not be cancelled at Razorpay, so it may still charge the customer.",
  "submission-failed-after-payment": "A customer paid but sending their setup answers failed. Their plan is active; send the setup by hand.",
  "tax-invoice-failed": "A payment was recorded but its tax invoice could not be issued. Issue it from the client page.",
  "invoice-register-failed": "The monthly invoice register could not be written because one invoice could not.",
  "discount-plan-failed": "Razorpay would not create the discounted plan a code needs, so no checkout opened.",
  "bundled-add-on-removal-failed": "Moving a subscription to a lower amount failed at Razorpay. Check its amount before the next renewal.",
  "basket-provider-repair-failed": "A change to a customer's services failed and putting Razorpay back on the right amount failed too. Check the amount at Razorpay.",
  "discount-end-provider-failed": "A code's discount ended but Razorpay would not move the subscription to the full amount. Check it before the next renewal.",
  "basket-flag-failed": "A change to a customer's services failed and flagging it for staff failed as well.",
  "upgrade-provider-failed": "A customer paid to move up, but Razorpay would not bill the new price from the next renewal. Finish the move by hand.",
  "add-on-plan-failed": "Razorpay would not make the plan an add-on needs, so no checkout opened.",
  "add-on-checkout-failed": "Razorpay would not open an add-on subscription, so no checkout opened.",
  "add-on-end-failed": "Razorpay would not stop an add-on subscription. The customer was asked to try again.",
  "add-on-end-not-recorded": "Razorpay was told to stop an add-on, but our record could not be updated. Check the subscription at Razorpay.",
  "add-on-view-failed": "An add-on row holds data the page cannot make sense of. Look at the row.",
  "bundled-add-on-keep-failed": "Keeping an add-on in a plan's payment failed at Razorpay. Check the subscription.",
  "add-on-provider-failed": "Razorpay would not take an add-on change. Check the subscription.",
};

const HIDDEN_FIELDS = new Set(["event", "businessId", "subscriptionId"]);

export function billingErrorTeamsCard(input: {
  readonly event: string;
  readonly fields: Readonly<Record<string, string | number | boolean | null>>;
  /** The console address of the client, when the error names one. */
  readonly clientUrl: string | null;
}): TeamsMessage {
  const facts = Object.entries(input.fields)
    .filter(([name, value]) => !HIDDEN_FIELDS.has(name) && value !== null && value !== "")
    .map(([name, value]) => ({ name, value: String(value) }));
  return teamsCard({
    title: `Billing error: ${input.event}`,
    facts,
    text: WHAT_HAPPENED[input.event] ?? "A billing step failed. The details are in the server log.",
    open: input.clientUrl === null ? null : { label: "Open the client", url: input.clientUrl },
  });
}
