import type { AddOnSubscriptionForStaff, BillingCurrency, BundledAddOn, PressRelease } from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { addOnActions, addOnView, type AddOnView } from "@brandbasket/shared/lib/billing/add-on-state";
import { addOnFactsOf, pickAddOnRows } from "@brandbasket/shared/lib/billing/add-on-rows";
import { formatCalendarDate } from "@brandbasket/shared/lib/format";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { AddOnAssessment } from "@brandbasket/shared/server/basket-change";
import type { StatusTone } from "@/components/console/status-dot";

/**
 * What the client page's Add-ons section shows for each add-on row and each press release. Pure, so the rules (which rows
 * count, what each state is called, when Pause and Cancel are offered) are tested without a page. Dates are in India
 * time, the same as the customer's Add-ons page, so staff and customer read the same day.
 */

const INDIA_TIME = "Asia/Kolkata";

export interface ClientAddOnState {
  readonly tone: StatusTone;
  readonly label: string;
}

export interface ClientAddOnRow {
  readonly id: string;
  readonly title: string;
  readonly state: ClientAddOnState;
  /** What the customer pays, before any GST, as it was fixed at purchase: "₹10,000 + GST a month", "$125 a month". */
  readonly price: string;
  /** The next billing, end or pause date in words, or null when there is none to say. */
  readonly dateLine: string | null;
  /** "Paused by Priya Shah on 18 October 2026": who scheduled an end, when it is set. */
  readonly endNote: string | null;
  /** Whether Pause and Cancel are offered on this row. Only the row in force, and only while it is active. */
  readonly canEnd: boolean;
  /** The date an end would take effect, for the confirm sentence. Null when `canEnd` is false. */
  readonly endsOnText: string | null;
  /** Paid, and nobody has marked the customer as contacted yet. */
  readonly needsContact: boolean;
  /** The day it was marked contacted, or null. */
  readonly contactedOn: string | null;
  /** The row holds data no state can be worked out from. It is shown, with no buttons, rather than breaking the page. */
  readonly broken: boolean;
}

function day(date: Date): string {
  return formatCalendarDate(date, INDIA_TIME);
}

function priceOf(row: AddOnSubscriptionForStaff): string {
  const offer = row.offerDiscountAmountCents > 0 ? ", 5% lifetime offer" : "";
  return `${formatMoney(row.netAmountCents, row.currency)}${row.taxRateBasisPoints > 0 ? " + GST" : ""} a month${offer}`;
}

function endNoteOf(row: AddOnSubscriptionForStaff): string | null {
  if (row.endKind !== "cancel" && row.endKind !== "pause") return null;
  const verb = row.endKind === "cancel" ? "Cancelled" : "Paused";
  const who = row.endRequestedByStaffId === null ? "the customer" : (row.endRequestedByStaffName ?? "a staff member");
  return row.endRequestedAt === null ? `${verb} by ${who}` : `${verb} by ${who} on ${day(row.endRequestedAt)}`;
}

function describeView(view: AddOnView): { readonly state: ClientAddOnState; readonly dateLine: string | null } {
  switch (view.state) {
    case "active":
      return { state: { tone: "done", label: "Active" }, dateLine: `Renews on ${day(view.renewsOn)}` };
    case "ending":
      return { state: { tone: "waiting", label: "Ending" }, dateLine: `Ends on ${day(view.endsOn)}` };
    case "pausing":
      return { state: { tone: "waiting", label: "Pausing" }, dateLine: `Pauses on ${day(view.pausesOn)}` };
    case "paused":
      return { state: { tone: "quiet", label: "Paused" }, dateLine: `Paused since ${day(view.since)}` };
    case "starting":
      return { state: { tone: "waiting", label: "Starting" }, dateLine: `Starting on ${day(view.since)}` };
    case "failing":
      return { state: { tone: "problem", label: "Payment failing" }, dateLine: null };
    case "failed":
      return { state: { tone: "problem", label: "Payment failed" }, dateLine: `Customer can pay until ${day(view.payBy)}` };
    case "ended":
    case "none":
      return { state: { tone: "quiet", label: "Ended" }, dateLine: null };
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled add-on view ${JSON.stringify(unhandled)}`);
    }
  }
}

/** A row the add-on has moved on from: a kept subscription's predecessor, a resumed or paid-again row. */
function earlierRow(row: AddOnSubscriptionForStaff, now: Date): Pick<ClientAddOnRow, "state" | "dateLine"> {
  const until = row.endedAt ?? row.currentPeriodEnd;
  const dateLine = until === null ? null : until.getTime() > now.getTime() ? `Paid until ${day(until)}` : `Ended on ${day(until)}`;
  return { state: { tone: "quiet", label: "Earlier" }, dateLine };
}

function shared(row: AddOnSubscriptionForStaff, addOn: MonthlyAddOnId): Pick<ClientAddOnRow, "id" | "title" | "price" | "endNote" | "needsContact" | "contactedOn"> {
  return {
    id: row.id,
    title: addOnById(addOn).title,
    price: priceOf(row),
    endNote: endNoteOf(row),
    needsContact: row.activatedAt !== null && row.contactedAt === null,
    contactedOn: row.contactedAt === null ? null : day(row.contactedAt),
  };
}

function brokenRow(row: AddOnSubscriptionForStaff, addOn: MonthlyAddOnId): ClientAddOnRow {
  return {
    ...shared(row, addOn),
    state: { tone: "problem", label: "Needs a look" },
    dateLine: "This row's data is wrong. Ask engineering to check it.",
    canEnd: false,
    endsOnText: null,
    broken: true,
  };
}

/**
 * Every add-on row worth showing for one business, grouped by add-on and newest first within each. An unpaid checkout and a
 * row cancelled before it was ever paid are left out: they never ran. For each add-on, the row in force (the kept
 * subscription if there is one, else the newest that ran) carries the state, the date and the buttons; the others read as
 * earlier. `rowsNewestFirst` is as listAddOnSubscriptionsForStaff returns them.
 */
export function clientAddOnRows(rowsNewestFirst: readonly AddOnSubscriptionForStaff[], now: Date): ClientAddOnRow[] {
  return MONTHLY_ADD_ON_IDS.flatMap((addOn) => {
    const rows = rowsNewestFirst.filter((row) => row.addOn === addOn);
    const picked = pickAddOnRows(rows);
    const inForce = picked.successor ?? picked.current;
    return rows.flatMap((row): ClientAddOnRow[] => {
      if (row.status === "incomplete" || (row.status === "cancelled" && row.activatedAt === null)) return [];
      if (row.id !== inForce?.id) return [{ ...shared(row, addOn), ...earlierRow(row, now), canEnd: false, endsOnText: null, broken: false }];
      try {
        const view = addOnView(
          picked.current === null ? null : addOnFactsOf(picked.current),
          picked.successor === null ? null : addOnFactsOf(picked.successor),
          now,
        );
        const actions = addOnActions(view);
        const canEnd = actions.includes("pause") || actions.includes("cancel");
        const endsOn = view.state === "active" ? view.renewsOn : null;
        return [{ ...shared(row, addOn), ...describeView(view), canEnd, endsOnText: canEnd && endsOn !== null ? day(endsOn) : null, broken: false }];
      } catch (error) {
        if (error instanceof RangeError) return [brokenRow(row, addOn)];
        throw error;
      }
    });
  });
}

/** An add-on billed in the plan's monthly charge: taken at the first checkout, or added to the running plan since. */
export interface ClientBundledAddOnRow {
  readonly id: string;
  readonly addOn: MonthlyAddOnId;
  readonly title: string;
  readonly state: ClientAddOnState;
  /** What it adds to the monthly payment, before GST: "₹6,650 + GST a month, 5% lifetime offer, billed with the plan". */
  readonly price: string;
  readonly dateLine: string | null;
  /** Paid, and nobody has marked the customer as contacted yet. */
  readonly needsContact: boolean;
  readonly contactedOn: string | null;
  /** Active and not ending: staff can take it out from the next billing date, given as `endsOnText`. */
  readonly canRemove: boolean;
  readonly endsOnText: string | null;
  /** Added and paid, but the provider was never told to bill it from the next renewal: staff can retry that. */
  readonly canRetry: boolean;
}

/** What the rows need besides the add-on rows themselves. */
export interface BundledRowContext {
  /** The next billing date of the plan the add-ons ride on, or null with none. */
  readonly nextBillingOn: Date | null;
  /** The amount of each add-on charge still waiting to be paid, by charge id. */
  readonly openChargeCents: ReadonlyMap<string, number>;
}

function bundledState(row: BundledAddOn, currency: BillingCurrency, context: BundledRowContext): Pick<ClientBundledAddOnRow, "state" | "dateLine" | "canRetry"> {
  if (row.status === "removed") {
    return { state: { tone: "quiet", label: "Removed" }, dateLine: row.removedAt === null ? null : `Removed on ${day(row.removedAt)}`, canRetry: false };
  }
  if (row.status === "pending") {
    const cents = row.chargeId === null ? undefined : context.openChargeCents.get(row.chargeId);
    const amount = cents === undefined ? "its charge" : `the ${formatMoney(cents, currency)} charge`;
    return { state: { tone: "waiting", label: "Waiting for payment" }, dateLine: `Added on ${day(row.createdAt)}, waiting for the customer to pay ${amount} for the rest of the month`, canRetry: false };
  }
  const activatedAt = row.activatedAt ?? row.createdAt;
  if (row.endRequestedAt !== null) {
    return { state: { tone: "waiting", label: "Ending" }, dateLine: `Customer asked to remove it on ${day(row.endRequestedAt)}; it stops at the next billing date`, canRetry: false };
  }
  if (row.billedFrom !== null) return { state: { tone: "done", label: "Active" }, dateLine: `Bought on ${day(activatedAt)}`, canRetry: false };
  const joins = context.nextBillingOn === null ? "the next billing date" : day(context.nextBillingOn);
  if (row.providerScheduledAt === null) {
    return { state: { tone: "problem", label: "Provider not told" }, dateLine: `Added on ${day(activatedAt)}. Retry so the provider bills it from ${joins}`, canRetry: true };
  }
  return { state: { tone: "done", label: "Active" }, dateLine: `Added on ${day(activatedAt)}; joins the monthly payment on ${joins}`, canRetry: false };
}

/**
 * The add-ons billed with the plan worth showing: paid ones, and ones added since sign-up that are waiting for their charge.
 * A pending one with no charge belongs to a first checkout that was never paid.
 */
export function clientBundledAddOnRows(rows: readonly BundledAddOn[], currency: BillingCurrency, context: BundledRowContext): ClientBundledAddOnRow[] {
  return rows.flatMap((row): ClientBundledAddOnRow[] => {
    if (!isMonthlyAddOnId(row.addOn)) return [];
    if (row.status === "pending" ? row.chargeId === null : row.activatedAt === null) return [];
    const canRemove = row.status === "active" && row.endRequestedAt === null;
    return [
      {
        id: row.id,
        addOn: row.addOn,
        title: addOnById(row.addOn).title,
        ...bundledState(row, currency, context),
        price: `${formatMoney(row.netAmountCents, currency)}${row.taxRateBasisPoints > 0 ? " + GST" : ""} a month, ${row.offerDiscountAmountCents > 0 ? "5% lifetime offer, " : ""}billed with the plan`,
        needsContact: row.activatedAt !== null && row.contactedAt === null,
        contactedOn: row.contactedAt === null ? null : day(row.contactedAt),
        canRemove,
        endsOnText: canRemove && context.nextBillingOn !== null ? day(context.nextBillingOn) : null,
      },
    ];
  });
}

/** An add-on staff can add for the client now, or keep when it is ending, with what it costs in words. */
export interface ClientAddOnOption {
  readonly addOn: MonthlyAddOnId;
  readonly title: string;
  readonly kind: "add" | "keep";
  /** "₹8,260 now for the 31 days left, then ₹11,798.82 a month with GST", or what keeping it means. */
  readonly costText: string;
}

/** The option for one add-on from its assessment, or null when it cannot be added or kept here. */
export function clientAddOnOption(addOn: MonthlyAddOnId, assessment: AddOnAssessment | null, currency: BillingCurrency): ClientAddOnOption | null {
  const title = addOnById(addOn).title;
  if (assessment?.kind === "keep") return { addOn, title, kind: "keep", costText: "It is ending: this keeps it, at no charge, and the monthly payment stays as it is." };
  if (assessment?.kind !== "offer") return null;
  const { quote } = assessment;
  const days = quote.daysLeft === 1 ? "the 1 day left" : `the ${quote.daysLeft} days left`;
  const tax = assessment.plan.taxRateBasisPoints > 0 ? " with GST" : "";
  return {
    addOn,
    title,
    kind: "add",
    costText: `${formatMoney(quote.chargeCents, currency)} now for ${days}, then ${formatMoney(quote.nextRenewalCents, currency)} a month${tax}. The customer pays the charge from Billing.`,
  };
}

export type PressReleaseStatus = PressRelease["status"];

export interface ClientPressReleaseRow {
  readonly id: string;
  readonly boughtOn: string;
  readonly amount: string;
  readonly status: PressReleaseStatus;
  readonly state: ClientAddOnState;
  /** The steps staff can move it to, nearest first. Never a step behind it. */
  readonly nextSteps: readonly Exclude<PressReleaseStatus, "waiting">[];
}

const PRESS_RELEASE_STATES: Readonly<Record<PressReleaseStatus, ClientAddOnState>> = {
  waiting: { tone: "waiting", label: "Waiting" },
  in_progress: { tone: "moving", label: "In progress" },
  published: { tone: "done", label: "Published" },
};

const NEXT_STEPS: Readonly<Record<PressReleaseStatus, ClientPressReleaseRow["nextSteps"]>> = {
  waiting: ["in_progress", "published"],
  in_progress: ["published"],
  published: [],
};

/** The business's paid press releases for the section, in the order given (newest first). */
export function clientPressReleaseRows(
  releases: readonly (PressRelease & { readonly paidAt: Date | null; readonly amountCents: number })[],
): ClientPressReleaseRow[] {
  return releases.map((release) => ({
    id: release.id,
    boughtOn: day(release.paidAt ?? release.createdAt),
    amount: `${formatMoney(release.amountCents, "INR")} with GST`,
    status: release.status,
    state: PRESS_RELEASE_STATES[release.status],
    nextSteps: NEXT_STEPS[release.status],
  }));
}
