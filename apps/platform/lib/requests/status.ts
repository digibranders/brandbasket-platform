import type { ChangeEventView, ChangeView } from "@brandbasket/db";
import { customerStepIndex, CUSTOMER_STATUSES, acceptLabel, INCLUDED_EDIT_MINUTES, INCLUDED_EDIT_WORKING_DAYS, quoteLine, REOPEN_WINDOW_DAYS, type CustomerStatus } from "@brandbasket/shared/lib/change-requests";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { addWorkingDays, BRAND_TIME_ZONE, dayMonth, shortDay } from "@/lib/call-dates";

/** One of the five steps under a request's title. */
export interface StepperRow {
  readonly label: CustomerStatus;
  /** `done` is filled, `now` is where the request is, `todo` has not happened. A finished request is all done. */
  readonly mark: "done" | "now" | "todo";
  /** The date it happened ("27 Nov"), "Included" for a quote step that never was, or nothing. */
  readonly note: string | null;
}

/**
 * The stepper: Sent, Quoted, In progress, Ready to check, Done, each with the date of the first time the request reached
 * it. A request covered without a quote shows "Included" where the quote would be. Null for a request that ended without
 * the change being made: it has no steps to show, the box under it says what happened.
 */
export function stepperRows(change: Pick<ChangeView, "state" | "coverage">, events: readonly ChangeEventView[]): readonly StepperRow[] | null {
  const current = customerStepIndex(change.state);
  if (current === null) return null;
  return CUSTOMER_STATUSES.map((label, index): StepperRow => {
    if (index > current) return { label, mark: "todo", note: null };
    const first = events.find((event) => customerStepIndex(event.state) === index);
    const skipped = first === undefined && index === 1 && (change.coverage === "included" || change.coverage === "free");
    return {
      label,
      mark: index < current || current === CUSTOMER_STATUSES.length - 1 ? "done" : "now",
      note: first !== undefined ? dayMonth(first.at) : skipped ? "Included" : null,
    };
  });
}

/** The day, in India, as `YYYY-MM-DD`. */
export function dayIn(at: Date): string {
  return dayKey(at.toISOString(), BRAND_TIME_ZONE);
}

/**
 * The day the change should be ready to check, as `YYYY-MM-DD`, or null when no date is promised. A quote that is waiting
 * promises it from today ("Accept today and it is ready by..."); work under way promises it from the day the customer said
 * yes (or, for an included edit, the day it was sent). Weekends are skipped; public holidays are not.
 */
export function readyByDay(change: Pick<ChangeView, "state" | "coverage" | "quote" | "acceptedAt" | "createdAt">, today: string): string | null {
  if (change.state === "quoted") return change.quote === null ? null : addWorkingDays(today, change.quote.workingDays);
  if (change.state !== "in_progress") return null;
  if (change.coverage === "paid") {
    if (change.quote === null || change.acceptedAt === null) return null;
    return addWorkingDays(dayIn(change.acceptedAt), change.quote.workingDays);
  }
  return addWorkingDays(dayIn(change.createdAt), INCLUDED_EDIT_WORKING_DAYS);
}

/** Whether the customer can still reopen: a finished change, or a quote they said not now to, for 14 days. */
export function canReopen(change: Pick<ChangeView, "state" | "coverage">, events: readonly ChangeEventView[], now: Date): boolean {
  const reopenable = change.state === "approved" || change.state === "shipped" || (change.state === "withdrawn" && change.coverage === "paid");
  if (!reopenable) return false;
  const entered = events.filter((event) => event.state === change.state).map((event) => event.at.getTime());
  if (entered.length === 0) return false;
  return now.getTime() - Math.max(...entered) <= REOPEN_WINDOW_DAYS * 86_400_000;
}

/** The one thing the box under the stepper asks the customer to do, if anything. */
export type NextStepAction =
  | { readonly kind: "accept"; readonly label: string }
  | { readonly kind: "pay"; readonly label: string; readonly chargeId: string }
  | { readonly kind: "approve"; readonly label: string };

export interface NextStep {
  readonly title: string;
  readonly text: string;
  /** The price line of a quote: what it is for, and the total. */
  readonly quote: { readonly line: string; readonly total: string } | null;
  /** The page's one dark button. */
  readonly action: NextStepAction | null;
  /** A soft button beside it: not now, or reopen. */
  readonly secondary: { readonly kind: "decline" | "reopen"; readonly label: string } | null;
}

const NO_BUTTONS = { action: null, secondary: null, quote: null } as const;

/** What happens next, in the words of the mock. `today` is the day in India as `YYYY-MM-DD`. */
export function nextStep(change: ChangeView, events: readonly ChangeEventView[], today: string, now: Date): NextStep {
  const readyBy = readyByDay(change, today);
  const date = readyBy === null ? null : shortDay(readyBy);
  const reopen = canReopen(change, events, now) ? ({ kind: "reopen", label: change.state === "withdrawn" ? "Reopen the quote" : "Reopen this change" } as const) : null;
  switch (change.state) {
    case "requested":
      return { title: "We have your request", text: "We will reply with a price, or tell you we have started. You do not need to do anything.", ...NO_BUTTONS };
    case "quoted": {
      const quote = change.quote;
      if (quote === null) return { title: "We are preparing your quote", text: "We will write to you in a moment.", ...NO_BUTTONS };
      const line = { line: quoteLine({ what: quote.what, hours: quote.hours, unitCents: quote.unitCents, currency: quote.currency }), total: formatMoney(quote.amountCents, quote.currency) };
      if (change.chargeId !== null && change.chargeStatus === "open") {
        return {
          title: "Waiting for your payment",
          text: `Pay ${line.total} and we start straight away. It is ready to check by ${date ?? "the date we agreed"}.`,
          quote: line,
          action: { kind: "pay", label: `Pay ${line.total}`, chargeId: change.chargeId },
          secondary: null,
        };
      }
      return {
        title: "Waiting for you",
        text: `This is more than an included ${INCLUDED_EDIT_MINUTES} minute edit, so it needs your OK first. Accept today and it is ready to check by ${date ?? "the date we agreed"}.`,
        quote: line,
        action: { kind: "accept", label: acceptLabel(quote.amountCents, quote.currency) },
        secondary: { kind: "decline", label: "Not now" },
      };
    }
    case "in_progress":
      return { title: "We are working on it", text: date === null ? "We will tell you when it is ready to check." : `It will be ready to check by ${date}.`, ...NO_BUTTONS };
    case "revisions":
      return { title: "We are making your changes", text: "We will tell you when it is ready to check again.", ...NO_BUTTONS };
    case "preview":
      return {
        title: "Ready for you",
        text: "Take a look. If it is right, press Looks good. If something needs fixing, write it below.",
        quote: null,
        action: { kind: "approve", label: "Looks good" },
        secondary: null,
      };
    case "approved":
      return { title: "Thank you", text: "We are putting this live now.", quote: null, action: null, secondary: reopen };
    case "shipped":
      return { title: "Done", text: "This change is live.", quote: null, action: null, secondary: reopen };
    case "declined":
      return { title: "We could not take this on", text: change.closedReason ?? "Write to us below if you would like to talk about it.", ...NO_BUTTONS };
    case "withdrawn":
      return {
        title: "You chose not to go ahead",
        text: reopen === null ? "Write to us below if you change your mind." : "The quote is still here if you change your mind.",
        quote: null,
        action: null,
        secondary: reopen,
      };
  }
}
