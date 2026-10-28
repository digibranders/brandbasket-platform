import { teamsCard, type TeamsMessage } from "./teams-webhook";

/*
 * The Teams card for something that happened to a customer's account: they signed up, sent their website details, closed
 * the account, or booked or changed a call. Pure: the announcer (server/customer-alerts.ts) gathers the facts, this words them.
 */

export type CustomerEvent = "setup_sent" | "account_closed" | "kickoff_booked" | "kickoff_changed" | "call_booked" | "call_changed";

const TITLES: Readonly<Record<CustomerEvent, string>> = {
  setup_sent: "Website details received",
  account_closed: "Account closed",
  kickoff_booked: "Kickoff call booked",
  kickoff_changed: "Kickoff call changed",
  call_booked: "Call booked",
  call_changed: "Call changed",
};

export interface CustomerCardInput {
  readonly event: CustomerEvent;
  readonly customer: { readonly name: string | null; readonly email: string | null; readonly phone: string | null };
  readonly business: { readonly name: string; readonly websiteUrl: string | null };
  /** What is particular to this event, such as the plan they chose or why they left. Empty values are left out. */
  readonly facts?: readonly { readonly name: string; readonly value: string | null | undefined }[];
  readonly text?: string | null;
  /** More buttons after the one that opens the client, such as the meeting link. */
  readonly buttons?: readonly { readonly label: string; readonly url: string }[];
  readonly consoleUrl: string;
}

export function customerEventTeamsCard(input: CustomerCardInput): TeamsMessage {
  return teamsCard({
    title: `${TITLES[input.event]}: ${input.business.name}`,
    facts: [
      { name: "Customer", value: input.customer.name },
      { name: "Mobile", value: input.customer.phone },
      { name: "Email", value: input.customer.email },
      { name: "Website", value: input.business.websiteUrl },
      ...(input.facts ?? []),
    ],
    text: input.text,
    open: { label: "Open the client", url: input.consoleUrl },
    ...(input.buttons === undefined ? {} : { buttons: input.buttons }),
  });
}
