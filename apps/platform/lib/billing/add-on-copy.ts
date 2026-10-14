import { type Brand } from "@/lib/brand";
import type { AddOnId } from "@fynix/shared/lib/billing/add-ons";
import type { AddOnAction, AddOnCheckoutIntent, AddOnEndKind, AddOnView } from "@fynix/shared/lib/billing/add-on-state";
import { formatCalendarDate } from "@fynix/shared/lib/format";
import { formatRupees } from "@fynix/shared/lib/directory/ads";

/**
 * The words on the Add-ons page: what each state says, what each button is called, and what the purchase dialog tells
 * the customer. Pure and browser-safe, so the sentences can be tested and the same ones are used wherever they appear.
 * Dates read "12 November 2026" in India time, as the server's own messages do (addOnEndMessage).
 */

const INDIA_TIME = "Asia/Kolkata";

/** What one add-on row says when its data is impossible, so one bad row never takes the page down. */
export const BROKEN_ADD_ON_LINE = "Something is wrong with this add-on. We're looking into it.";

/** A date as the page says it: "12 November 2026". */
export function addOnDate(date: Date): string {
  return formatCalendarDate(date, INDIA_TIME);
}

/** The day of the month in India, with its ordinal: "12th". */
export function dayOfMonthLabel(date: Date): string {
  const day = Number(new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: INDIA_TIME }).format(date));
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * The old billing date a Keep it carries the add-on past, or null when the view is not one a Keep it is offered on
 * (only an ending or pausing add-on). Null lets a caller show the row as broken instead of throwing while the page draws.
 */
export function keepDateOf(view: AddOnView): Date | null {
  if (view.state === "ending") return view.endsOn;
  if (view.state === "pausing") return view.pausesOn;
  return null;
}

/**
 * The line under an add-on's price, or null when the price speaks for itself (not bought, or ended). `netCents` is what
 * the customer pays each month before GST.
 */
export function addOnStateLine(view: AddOnView, netCents: number): string | null {
  switch (view.state) {
    case "none":
    case "ended":
      return null;
    case "active":
      return `Active. Renews on ${addOnDate(view.renewsOn)} at ${formatRupees(netCents)} + GST.`;
    case "ending":
      return `Ends on ${addOnDate(view.endsOn)}. You can use it until then.`;
    case "pausing":
      return `Pauses on ${addOnDate(view.pausesOn)}. You can use it until then.`;
    case "paused":
      return `Paused since ${addOnDate(view.since)}.`;
    case "starting":
      return `Starting on ${addOnDate(view.since)}. We're taking the first payment.`;
    case "failing":
      return "Your last payment didn't go through. Razorpay will try again over the next 3 days.";
    case "failed":
      return `We couldn't take your payment. Pay by ${addOnDate(view.payBy)} to keep it running.`;
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled add-on view ${JSON.stringify(unhandled)}`);
    }
  }
}

export interface AddOnActionLabel {
  /** What the button shows. */
  readonly text: string;
  /** What a screen reader says: the visible words first, then the add-on. */
  readonly ariaLabel: string;
}

/** A button's words and its full accessible name. The accessible name always starts with the visible text. */
export function addOnActionLabel(action: AddOnAction, title: string): AddOnActionLabel {
  switch (action) {
    case "buy":
      return { text: "Get it", ariaLabel: `Get it for ${title}` };
    case "pause":
      return { text: "Pause", ariaLabel: `Pause ${title}` };
    case "cancel":
      return { text: "Cancel", ariaLabel: `Cancel ${title}` };
    case "keep":
      return { text: "Keep it", ariaLabel: `Keep it for ${title}` };
    case "resume":
      return { text: "Resume", ariaLabel: `Resume ${title}` };
    case "pay-now":
      return { text: "Pay now", ariaLabel: `Pay now for ${title}` };
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled add-on action ${String(unhandled)}`);
    }
  }
}

/** The one sentence an inline Pause or Cancel asks, saying exactly what will happen. `date` is already formatted. */
export function endConfirmQuestion(kind: AddOnEndKind, title: string, date: string): string {
  return kind === "cancel"
    ? `Cancel ${title}? It stops on ${date} and you won't be charged again.`
    : `Pause ${title}? It pauses on ${date}; resume any time.`;
}

/**
 * What the page says once Pause or Cancel has gone through. It is the sentence the server gives for the same outcome
 * (addOnEndMessage), kept equal to it by a test, so the customer reads the same words either way.
 */
export function endSavedText(kind: AddOnEndKind, title: string, date: string): string {
  return kind === "cancel" ? `${title} will stop on ${date}. You won't be charged again.` : `${title} will pause on ${date}.`;
}

export interface PendingLabel {
  /** What the button shows while the request runs. */
  readonly text: string;
  /** What a screen reader says: it starts with the visible words and names the add-on. */
  readonly ariaLabel: string;
}

/** The inline confirm's "Yes" button while Pause or Cancel is being saved. */
export function endPendingLabel(kind: AddOnEndKind, title: string): PendingLabel {
  const verb = kind === "cancel" ? "Cancelling" : "Pausing";
  return { text: `${verb}…`, ariaLabel: `${verb} ${title}` };
}

/** The purchase dialog's Checkout button while the payment is being opened. */
export function checkoutPendingLabel(title: string): PendingLabel {
  return { text: "Opening payment…", ariaLabel: `Opening payment for ${title}` };
}

/** The first note of a monthly purchase. A day that some months lack (29 to 31) says what happens in those months. */
function renewalNote(renewDay: string): string {
  const match = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(renewDay);
  if (match === null) throw new RangeError(`Cannot read the renewal day "${renewDay}"`);
  const shorterMonths = Number(match[1]) >= 29 ? ", or the last day of shorter months" : "";
  return `Renews every month on the ${renewDay}${shorterMonths}. Pause or cancel any time; it stops at the end of the month you've paid for.`;
}

export interface CheckoutCopyInput {
  readonly intent: AddOnCheckoutIntent;
  readonly addOnId: AddOnId;
  readonly title: string;
  /** False only for the press release. */
  readonly monthly: boolean;
  /** For Keep it, the old billing date the card is charged on, already formatted. Null for every other intent. */
  readonly chargeDate: string | null;
  /** For a monthly add-on, the day of the month it renews on: "12th". Null for the press release. */
  readonly renewDay: string | null;
  /** The brand the dashboard is sold under; Fynix when left out. */
  readonly brand?: Brand;
}

export interface CheckoutCopy {
  readonly heading: string;
  /** For Keep it, when the card is charged. */
  readonly lead: string | null;
  /** The label of the total row. */
  readonly totalLabel: string;
  /** The sentences under the price, in order. */
  readonly notes: readonly string[];
}

const HEADING_VERB: Readonly<Record<AddOnCheckoutIntent, string>> = {
  buy: "Get",
  resume: "Resume",
  "pay-now": "Pay for",
  keep: "Keep",
};

/**
 * What the purchase dialog says around the price. Keep it differs: Razorpay takes nothing today (it authorises a
 * subscription that starts on the old billing date), so the dialog says when the card is charged, totals on that date,
 * and promises no call from the team, since the add-on is already running. Pay now promises no call either: it carries
 * the contacted mark of the row it continues.
 */
export function checkoutCopy(input: CheckoutCopyInput): CheckoutCopy {
  const { intent, addOnId, title, monthly, chargeDate, renewDay } = input;
  const keeping = intent === "keep";
  // Keep it and Pay now continue a row staff already know about (it carries the contacted mark), so no call is promised.
  // Buy and Resume are purchases staff see as new.
  const teamContacts = intent === "buy" || intent === "resume";
  if (keeping && chargeDate === null) throw new RangeError("Keep it needs the date the card is charged");
  if (monthly && renewDay === null) throw new RangeError("A monthly add-on needs the day it renews on");

  const notes: string[] = [];
  if (monthly && renewDay !== null) {
    notes.push(renewalNote(renewDay));
  }
  if (addOnId === "performance-marketing") notes.push("This is Fynix Digital's fee. You pay the ad platforms directly.");
  if (!monthly) notes.push("One-time payment.");
  if (teamContacts) notes.push("After you pay, our team will contact you to get started.");

  return {
    heading: `${HEADING_VERB[intent]} ${title}`,
    lead: keeping ? `Your card will be charged on ${chargeDate}.` : null,
    totalLabel: keeping ? `Total on ${chargeDate}` : "Total today",
    notes,
  };
}

/**
 * The old billing date a Keep it carries the add-on past, from the row's state after the return, or null when the
 * state is not one a Keep it can leave behind. The webhook that moves the row to "active, renewing on that day" can
 * arrive a moment after the customer does, and until then the row still reads as ending or pausing on the same date,
 * so those give the same answer.
 */
export function keptNoticeDate(view: AddOnView): Date | null {
  switch (view.state) {
    case "active":
      return view.renewsOn;
    case "ending":
      return view.endsOn;
    case "pausing":
      return view.pausesOn;
    case "starting":
      return view.since;
    case "none":
    case "ended":
    case "paused":
    case "failing":
    case "failed":
      return null;
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled add-on view ${JSON.stringify(unhandled)}`);
    }
  }
}

export type PressReleaseStatus = "waiting" | "in_progress" | "published";

/** Where a press release has got to, as the customer reads it. Staff set the status. */
export function pressReleaseStatusLabel(status: PressReleaseStatus): string {
  switch (status) {
    case "waiting":
      return "We'll contact you";
    case "in_progress":
      return "In progress";
    case "published":
      return "Published";
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled press release status ${String(unhandled)}`);
    }
  }
}

export interface TestCheckoutCopy {
  readonly body: string;
  readonly buttonLabel: string;
}

/**
 * What the fake provider's test checkout says. A keep has a start date and charges nothing now, so confirming it only
 * records the authorisation; anything else records a payment.
 */
export function testCheckoutCopy(title: string, startAt: Date | null): TestCheckoutCopy {
  const lead = "This page stands in for the payment provider while payments are simulated.";
  if (startAt === null) {
    return { body: `${lead} Pay records the payment for ${title}; Cancel takes you back with nothing recorded.`, buttonLabel: "Pay" };
  }
  return {
    body: `${lead} Confirm records the authorisation. Nothing is charged until ${addOnDate(startAt)}. Cancel takes you back with nothing recorded.`,
    buttonLabel: "Confirm",
  };
}
