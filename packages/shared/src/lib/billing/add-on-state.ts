import { ADD_ON_GRACE_DAYS } from "./add-ons";

/**
 * What an add-on subscription shows and allows (docs/superpowers/specs/2026-10-09-add-ons-design.md, "Add-ons page").
 * Worked out from the stored row and the clock, so a scheduled end and the 7-day grace need no job. Pure and
 * browser-safe.
 */

export type AddOnSubscriptionStatus = "incomplete" | "scheduled" | "active" | "past_due" | "halted" | "cancelled";
export type AddOnEndKind = "cancel" | "pause";

/** The fields of an add_on_subscriptions row these rules read. */
export interface AddOnFacts {
  readonly status: AddOnSubscriptionStatus;
  readonly endKind: AddOnEndKind | null;
  /** The end of the paid period: the next billing date. Null before the first payment. */
  readonly currentPeriodEnd: Date | null;
  readonly haltedAt: Date | null;
  readonly endedAt: Date | null;
  /** For a kept subscription, the day it starts and is first charged. */
  readonly startAt: Date | null;
}

export type AddOnView =
  | { readonly state: "none" }
  | { readonly state: "active"; readonly renewsOn: Date }
  | { readonly state: "ending"; readonly endsOn: Date }
  | { readonly state: "pausing"; readonly pausesOn: Date }
  | { readonly state: "paused"; readonly since: Date }
  /** A kept subscription whose start day has come and whose first payment Razorpay has not reported yet. */
  | { readonly state: "starting"; readonly since: Date }
  | { readonly state: "failing" }
  | { readonly state: "failed"; readonly payBy: Date }
  | { readonly state: "ended" };

export type AddOnAction = "buy" | "pause" | "cancel" | "keep" | "resume" | "pay-now";

const DAY_MS = 24 * 60 * 60 * 1000;

function periodEnd(facts: AddOnFacts): Date {
  if (facts.currentPeriodEnd === null) throw new RangeError("A paid add-on has no period end");
  return facts.currentPeriodEnd;
}

/**
 * A kept subscription that is authorised and waiting (status scheduled) is "active, renewing on its start day" while that
 * day is still ahead. Once the day has come with no charge recorded, Razorpay may take minutes or hours to report the
 * first payment, so it reads as starting, not failed. A failed first charge arrives as its own status (past_due, then
 * halted), which shows as failing and failed like any other row.
 */
function scheduledView(facts: AddOnFacts, now: Date): AddOnView {
  if (facts.startAt === null) throw new RangeError("A scheduled add-on has no start");
  return facts.startAt.getTime() > now.getTime() ? { state: "active", renewsOn: facts.startAt } : { state: "starting", since: facts.startAt };
}

/**
 * End actions (Pause, Cancel) are only offered on active rows, so `endKind` is only ever set on active, scheduled or
 * cancelled rows, which is why past_due and halted ignore it.
 *
 * `current` is the business's newest add-on row for one add-on that is not an unpaid checkout; `successor` is a kept
 * subscription waiting to start (status scheduled), or null.
 */
export function addOnView(current: AddOnFacts | null, successor: AddOnFacts | null, now: Date): AddOnView {
  if (successor !== null && successor.status === "scheduled" && successor.startAt !== null) return scheduledView(successor, now);
  if (current === null) return { state: "none" };
  switch (current.status) {
    case "incomplete":
      return { state: "none" };
    case "scheduled":
      return scheduledView(current, now);
    case "active": {
      const end = periodEnd(current);
      if (current.endKind === null) return { state: "active", renewsOn: end };
      if (end.getTime() > now.getTime()) {
        return current.endKind === "cancel" ? { state: "ending", endsOn: end } : { state: "pausing", pausesOn: end };
      }
      return current.endKind === "cancel" ? { state: "ended" } : { state: "paused", since: end };
    }
    case "past_due":
      return { state: "failing" };
    case "halted": {
      if (current.haltedAt === null) throw new RangeError("A halted add-on has no halt time");
      const payBy = new Date(current.haltedAt.getTime() + ADD_ON_GRACE_DAYS * DAY_MS);
      return now.getTime() < payBy.getTime() ? { state: "failed", payBy } : { state: "ended" };
    }
    case "cancelled":
      if (current.endKind === "pause") {
        const since = current.currentPeriodEnd ?? current.endedAt;
        if (since === null) throw new RangeError("A paused add-on has no pause date");
        return { state: "paused", since };
      }
      return { state: "ended" };
    default: {
      const unhandled: never = current.status;
      throw new Error(`Unhandled add-on status ${String(unhandled)}`);
    }
  }
}

export function addOnActions(view: AddOnView): readonly AddOnAction[] {
  switch (view.state) {
    case "none":
    case "ended":
      return ["buy"];
    case "active":
      return ["pause", "cancel"];
    case "ending":
    case "pausing":
      return ["keep"];
    case "paused":
      return ["resume"];
    case "starting":
    case "failing":
      return [];
    case "failed":
      return ["pay-now"];
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled add-on view ${JSON.stringify(unhandled)}`);
    }
  }
}

export interface AddOnStatusChange {
  readonly status: AddOnSubscriptionStatus;
  readonly haltedAt?: Date;
  readonly endedAt?: Date;
}

/**
 * Our status after a Razorpay status event, or null for no change. Payments move a subscription to active through the
 * charged event, not here; cancelled is final. Razorpay can repeat an event or deliver one late, so an event only
 * moves a row forward from the states it can really follow: a repeated halted must not restart the 7 days to pay, and
 * a late pending must not pull a halted row back to past_due.
 *
 * A kept subscription (scheduled) has never been charged. When its first charge fails, Razorpay retries it (pending)
 * and then gives up (halted), so both follow from scheduled, and the halt starts the 7 days to pay like any other.
 */
export function nextAddOnStatus(
  current: AddOnSubscriptionStatus,
  providerStatus: string,
  now: Date,
  startAt: Date | null,
): AddOnStatusChange | null {
  if (current === "cancelled") return null;
  switch (providerStatus) {
    case "authenticated":
      return current === "incomplete" && startAt !== null && startAt.getTime() > now.getTime() ? { status: "scheduled" } : null;
    case "pending":
      return current === "active" || current === "scheduled" ? { status: "past_due" } : null;
    case "halted":
      return current === "active" || current === "past_due" || current === "scheduled" ? { status: "halted", haltedAt: now } : null;
    case "cancelled":
    case "completed":
    case "expired":
      return { status: "cancelled", endedAt: now };
    default:
      return null;
  }
}

export type AddOnCheckoutIntent = "buy" | "resume" | "pay-now" | "keep";

export type AddOnCheckoutDecision =
  | {
      readonly kind: "allowed";
      /** True for Keep it: the new subscription starts on the old billing date. */
      readonly startsOnPeriodEnd: boolean;
      /** True when the new subscription continues the current one, at its stored price. */
      readonly continues: boolean;
    }
  | {
      readonly kind: "refused";
      /**
       * "already-active": a buy while the add-on is running, scheduled to end or pause, or retrying a payment, and any
       * action while a kept subscription is starting (it is billing).
       * "not-allowed": any other action the state does not offer, including a buy while paused or failed, where the
       * right button is Resume or Pay now.
       */
      readonly reason: "already-active" | "not-allowed";
    };

const INTENT_ACTION: Readonly<Record<AddOnCheckoutIntent, AddOnAction>> = {
  buy: "buy",
  resume: "resume",
  "pay-now": "pay-now",
  keep: "keep",
};

/** Whether the add-on is running now or still paid for, so buying it again would double up. */
function isRunning(view: AddOnView): boolean {
  return view.state === "active" || view.state === "ending" || view.state === "pausing" || view.state === "starting" || view.state === "failing";
}

export function decideAddOnCheckout(intent: AddOnCheckoutIntent, view: AddOnView): AddOnCheckoutDecision {
  if (!addOnActions(view).includes(INTENT_ACTION[intent])) {
    // A starting subscription is billing, so whatever was asked for, the answer is that it is already running.
    return { kind: "refused", reason: view.state === "starting" || (intent === "buy" && isRunning(view)) ? "already-active" : "not-allowed" };
  }
  return { kind: "allowed", startsOnPeriodEnd: intent === "keep", continues: intent !== "buy" };
}
