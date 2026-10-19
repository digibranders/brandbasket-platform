import type { AddOnSubscriptionForStaff, BillingCurrency, BundledAddOn, PressRelease } from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { addOnActions, addOnView, type AddOnView } from "@brandbasket/shared/lib/billing/add-on-state";
import { addOnFactsOf, pickAddOnRows } from "@brandbasket/shared/lib/billing/add-on-rows";
import { formatCalendarDate } from "@brandbasket/shared/lib/format";
import { formatMoney } from "@brandbasket/shared/lib/money";
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
  const premium = row.discountAmountCents - row.offerDiscountAmountCents > 0 ? ", Premium price" : "";
  const offer = row.offerDiscountAmountCents > 0 ? ", 5% lifetime offer" : "";
  return `${formatMoney(row.netAmountCents, row.currency)}${row.taxRateBasisPoints > 0 ? " + GST" : ""} a month${premium}${offer}`;
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

/** An add-on the customer took with the plan at the first checkout, billed in the plan's monthly charge. */
export interface ClientBundledAddOnRow {
  readonly id: string;
  readonly title: string;
  readonly state: ClientAddOnState;
  /** What it adds to the monthly payment, before GST: "₹1,899.05 + GST a month, 5% lifetime offer, billed with the plan". */
  readonly price: string;
  readonly dateLine: string | null;
  /** Paid, and nobody has marked the customer as contacted yet. */
  readonly needsContact: boolean;
  readonly contactedOn: string | null;
}

/** The add-ons taken with the plan worth showing: the ones paid for. A pending one belongs to a checkout that was never paid. */
export function clientBundledAddOnRows(rows: readonly BundledAddOn[], currency: BillingCurrency): ClientBundledAddOnRow[] {
  return rows.flatMap((row): ClientBundledAddOnRow[] => {
    if (row.status === "pending" || row.activatedAt === null || !isMonthlyAddOnId(row.addOn)) return [];
    const removed = row.status === "removed";
    const ending = !removed && row.endRequestedAt !== null;
    return [
      {
        id: row.id,
        title: addOnById(row.addOn).title,
        state: removed ? { tone: "quiet", label: "Removed" } : ending ? { tone: "waiting", label: "Ending" } : { tone: "done", label: "Active" },
        price: `${formatMoney(row.netAmountCents, currency)}${row.taxRateBasisPoints > 0 ? " + GST" : ""} a month, ${row.offerDiscountAmountCents > 0 ? "5% lifetime offer, " : ""}billed with the plan`,
        dateLine: removed
          ? row.removedAt === null ? null : `Removed on ${day(row.removedAt)}`
          : ending
            ? `Customer asked to remove it on ${day(row.endRequestedAt ?? row.activatedAt)}; it stops at the next billing date`
            : `Bought on ${day(row.activatedAt)}`,
        needsContact: row.contactedAt === null,
        contactedOn: row.contactedAt === null ? null : day(row.contactedAt),
      },
    ];
  });
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
