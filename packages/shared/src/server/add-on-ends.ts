import "server-only";
import type { BillingProvider } from "@firstfold/billing";
import {
  changeAddOnEndKind,
  findAddOnSubscription,
  listAddOnSubscriptionsForBusiness,
  lockBusinessForBilling,
  markAddOnCancelled,
  scheduleAddOnEnd,
  type AddOnSubscription,
  type Database,
  type ScopedTransaction,
} from "@firstfold/db";
import { addOnById, isMonthlyAddOnId, type MonthlyAddOnId } from "../lib/billing/add-ons";
import type { AddOnEndKind } from "../lib/billing/add-on-state";
import { formatCalendarDate } from "../lib/format";
import { describeError, logBillingEvent } from "./billing-log";

/**
 * Pause and Cancel for one add-on (docs/superpowers/specs/2026-10-09-add-ons-design.md), for the customer's Add-ons page
 * and for staff acting on a customer's behalf. Both stop the subscription at the provider at the end of the month already
 * paid for and record the end, so nobody who asked can be charged again. There is no scheduled job: the end date is
 * worked out from the stored row when it is shown (addOnView).
 *
 * The provider is never called inside a database transaction. A short transaction under the business's billing lock
 * reads the row, the provider is told, and a second one under the lock records the result, so a provider that cannot be
 * reached records nothing and a slow one holds no lock.
 */

export interface AddOnEndRequest {
  readonly businessId: string;
  readonly addOnSubscriptionId: string;
  readonly kind: AddOnEndKind;
  /** The staff member acting for the customer, or null when the customer asked. */
  readonly staffUserId: string | null;
}

export type AddOnEndRefusal =
  /** No such row for this business. */
  | "not-found"
  /** The row is not an active subscription, so there is nothing to stop. */
  | "not-running"
  /** An end is already set (the first request stands, whatever kind it was). */
  | "already-ending"
  /** The provider could not be told, so nothing was recorded. */
  | "provider-unavailable"
  /** The row changed between reading it and recording the result. */
  | "changed-meanwhile";

export type AddOnEndOutcome =
  /** An active add-on will now stop or pause on `endsOn`, the end of the month it has paid for. */
  | { readonly kind: "scheduled"; readonly addOn: MonthlyAddOnId; readonly endKind: AddOnEndKind; readonly endsOn: Date }
  /**
   * A kept subscription that had not started was cancelled, which brings back the Ending or Pausing state of the row it
   * continues, now of the kind that was asked for (the provider stops the old subscription at cycle end either way).
   * `endsOn` is that row's end. `endKind` is what the row will now do, which is what was asked unless it could no longer
   * be changed.
   */
  | { readonly kind: "keep-undone"; readonly addOn: MonthlyAddOnId; readonly endKind: AddOnEndKind; readonly endsOn: Date }
  | {
      readonly kind: "refused";
      readonly reason: AddOnEndRefusal;
      /** Null when the row was not found. */
      readonly addOn: MonthlyAddOnId | null;
      /** For `already-ending`: what is already set and when. Null otherwise. */
      readonly endKind: AddOnEndKind | null;
      readonly endsOn: Date | null;
    };

function refusal(reason: AddOnEndRefusal, addOn: MonthlyAddOnId | null, existing?: { endKind: AddOnEndKind; endsOn: Date }): AddOnEndOutcome {
  return { kind: "refused", reason, addOn, endKind: existing?.endKind ?? null, endsOn: existing?.endsOn ?? null };
}

function endKindOf(value: string | null): AddOnEndKind | null {
  return value === "cancel" || value === "pause" ? value : null;
}

/** What a row already ending says about itself, or undefined for a row with no end or no date to name. */
function existingEnd(row: AddOnSubscription): { endKind: AddOnEndKind; endsOn: Date } | undefined {
  const endKind = endKindOf(row.endKind);
  return endKind === null || row.currentPeriodEnd === null ? undefined : { endKind, endsOn: row.currentPeriodEnd };
}

function monthlyAddOn(row: AddOnSubscription): MonthlyAddOnId {
  if (!isMonthlyAddOnId(row.addOn)) throw new Error(`Add-on row ${row.id} is for ${row.addOn}, which is not a monthly add-on`);
  return row.addOn;
}

interface ReadForEnd {
  readonly row: AddOnSubscription;
  /** For a kept subscription, the row it continues. */
  readonly continued: AddOnSubscription | null;
}

/**
 * Ends one add-on, or undoes a Keep it that has not started. Returns what happened for the caller to say (see
 * addOnEndMessage); it throws only for a database failure.
 *
 * - An active row with no end: the provider is told to stop at the end of the cycle, then the end is recorded.
 * - A kept subscription waiting for its start date: cancelled at the provider at once and marked cancelled. The row it
 *   continues is still ending, so that is what the customer is back to; if the button pressed was the other kind of end
 *   (Pause on a row set to cancel, or the reverse), that row's end is changed to the kind asked for, since the provider
 *   already ends it at cycle end either way.
 * - Anything else is refused with the reason.
 */
export async function scheduleAddOnEndFor(
  staffDb: Database,
  provider: BillingProvider,
  request: AddOnEndRequest,
  now: Date,
): Promise<AddOnEndOutcome> {
  const { businessId, addOnSubscriptionId, kind, staffUserId } = request;

  const read = await staffDb.transaction(async (tx): Promise<ReadForEnd | null> => {
    await lockBusinessForBilling(tx, businessId);
    const row = await findAddOnSubscription(tx, businessId, addOnSubscriptionId);
    if (row === null) return null;
    const continued = row.status === "scheduled" && row.continuesId !== null ? await findAddOnSubscription(tx, businessId, row.continuesId) : null;
    return { row, continued };
  });
  if (read === null) return refusal("not-found", null);
  const { row, continued } = read;
  const addOn = monthlyAddOn(row);

  const logFields = { businessId, addOnSubscriptionId, provider: row.provider, providerSubscriptionId: row.providerSubscriptionId };
  // A row opened at another provider (a fake checkout left over after switching to Razorpay) cannot be stopped from here.
  const reachable = row.provider === provider.name;

  if (row.status === "active") {
    const existing = existingEnd(row);
    if (row.endKind !== null) return existing === undefined ? refusal("not-running", addOn) : refusal("already-ending", addOn, existing);
    if (!reachable) {
      logBillingEvent("error", "add-on-end-failed", { ...logFields, errorName: "ProviderNotConfigured", errorMessage: `The subscription belongs to ${row.provider}, but ${provider.name} is configured.` });
      return refusal("provider-unavailable", addOn);
    }
    try {
      await provider.cancelSubscriptionAtPeriodEnd(row.providerSubscriptionId);
    } catch (error) {
      logBillingEvent("error", "add-on-end-failed", { ...logFields, ...describeError(error) });
      return refusal("provider-unavailable", addOn);
    }
    return staffDb.transaction(async (tx): Promise<AddOnEndOutcome> => {
      await lockBusinessForBilling(tx, businessId);
      const recorded = await scheduleAddOnEnd(tx, { id: addOnSubscriptionId, kind, now, staffUserId });
      // Read after the write: a renewal landing between the two transactions moved the end, and that is the date to say.
      const fresh = await findAddOnSubscription(tx, businessId, addOnSubscriptionId);
      if (recorded === "scheduled" && fresh !== null) {
        return { kind: "scheduled", addOn, endKind: kind, endsOn: fresh.currentPeriodEnd ?? row.currentPeriodEnd ?? now };
      }
      const earlier = fresh === null ? undefined : existingEnd(fresh);
      if (recorded === "already" && earlier !== undefined) return refusal("already-ending", addOn, earlier);
      logBillingEvent("error", "add-on-end-not-recorded", { ...logFields, result: recorded });
      return refusal("changed-meanwhile", addOn);
    });
  }

  if (row.status === "scheduled") {
    if (!reachable) {
      logBillingEvent("error", "add-on-end-failed", { ...logFields, errorName: "ProviderNotConfigured", errorMessage: `The subscription belongs to ${row.provider}, but ${provider.name} is configured.` });
      return refusal("provider-unavailable", addOn);
    }
    try {
      await provider.cancelSubscription(row.providerSubscriptionId);
    } catch (error) {
      logBillingEvent("error", "add-on-end-failed", { ...logFields, ...describeError(error) });
      return refusal("provider-unavailable", addOn);
    }
    return staffDb.transaction(async (tx): Promise<AddOnEndOutcome> => {
      await lockBusinessForBilling(tx, businessId);
      const fresh = await findAddOnSubscription(tx, businessId, addOnSubscriptionId);
      if (fresh === null || fresh.status !== "scheduled") {
        logBillingEvent("error", "add-on-end-not-recorded", { ...logFields, result: fresh?.status ?? "missing" });
        return refusal("changed-meanwhile", addOn);
      }
      await markAddOnCancelled(tx, addOnSubscriptionId, now);
      const earlier = continued === null ? undefined : existingEnd(continued);
      let endKind = earlier?.endKind ?? kind;
      if (continued !== null && earlier !== undefined && earlier.endKind !== kind) {
        const changed = await changeAddOnEndKind(tx, { id: continued.id, kind, now, staffUserId });
        if (changed === "changed") endKind = kind;
      }
      return { kind: "keep-undone", addOn, endKind, endsOn: earlier?.endsOn ?? row.startAt ?? now };
    });
  }

  return refusal("not-running", addOn);
}

/**
 * Closing an account ends every add-on of the business. This is split in three so the caller can keep the order that
 * keeps the books true (apps/platform/lib/server/account-exit.ts): plan what each row needs, tell the provider with no
 * transaction open, then record every end in the closure's own transaction, so a provider that fails part way leaves
 * nothing recorded.
 *
 * - `end-at-period-end`: an active add-on with no end. The month already paid for runs out; nothing more is taken.
 * - `switch-to-cancel`: an active add-on with a pause set. Razorpay already ends it at cycle end, so only our record
 *   changes from pause to cancel.
 * - `cancel-now`: a row that has not been paid for (a Keep it that has not started, an unpaid checkout) or whose
 *   current period is unpaid (past due, halted). There is no paid time to run out, so it is cancelled at once.
 * An active add-on already set to cancel, and a cancelled row, need nothing.
 */
export type AddOnClosureAction = "end-at-period-end" | "switch-to-cancel" | "cancel-now";

export interface AddOnClosureStep {
  readonly row: AddOnSubscription;
  readonly action: AddOnClosureAction;
}

function closureActionFor(row: AddOnSubscription): AddOnClosureAction | null {
  switch (row.status) {
    case "active":
      if (row.endKind === null) return "end-at-period-end";
      return row.endKind === "pause" ? "switch-to-cancel" : null;
    case "scheduled":
    case "incomplete":
    case "past_due":
    case "halted":
      return "cancel-now";
    case "cancelled":
      return null;
    default: {
      const unhandled: never = row.status;
      throw new Error(`Unhandled add-on status ${String(unhandled)}`);
    }
  }
}

/** What closing the account does to each of the business's add-on rows. Pure: it reads the rows and nothing else. */
export function planAddOnClosure(rows: readonly AddOnSubscription[]): AddOnClosureStep[] {
  const steps: AddOnClosureStep[] = [];
  for (const row of rows) {
    const action = closureActionFor(row);
    if (action !== null) steps.push({ row, action });
  }
  return steps;
}

/**
 * Tells the provider to stop every add-on the plan needs stopped. Returns true when all of it is done, false at the
 * first failure (logged by name, never quoted), and the caller then records nothing and refuses the closure.
 *
 * Safe to run again after a failure: the steps come from rows that were not changed, so a retry plans exactly the same
 * calls, and BillingProvider's stop calls resolve when the subscription is already stopped. A row at another provider
 * than the configured one is checked before any call is made, so that case fails with the provider untouched.
 * Rows held by hand ("manual") have nothing at any provider.
 */
export async function stopAddOnsAtProvider(provider: BillingProvider, steps: readonly AddOnClosureStep[]): Promise<boolean> {
  const calls = steps.filter((step) => step.action !== "switch-to-cancel" && step.row.provider !== "manual");
  for (const { row } of calls) {
    if (row.provider !== provider.name) {
      logBillingEvent("error", "add-on-end-failed", {
        businessId: row.businessId,
        addOnSubscriptionId: row.id,
        provider: row.provider,
        providerSubscriptionId: row.providerSubscriptionId,
        errorName: "ProviderNotConfigured",
        errorMessage: `The subscription belongs to ${row.provider}, but ${provider.name} is configured.`,
      });
      return false;
    }
  }
  for (const { row, action } of calls) {
    try {
      if (action === "end-at-period-end") await provider.cancelSubscriptionAtPeriodEnd(row.providerSubscriptionId);
      else await provider.cancelSubscription(row.providerSubscriptionId);
    } catch (error) {
      logBillingEvent("error", "add-on-end-failed", {
        businessId: row.businessId,
        addOnSubscriptionId: row.id,
        provider: row.provider,
        providerSubscriptionId: row.providerSubscriptionId,
        ...describeError(error),
      });
      return false;
    }
  }
  return true;
}

/** A row needed ending after the closure had recorded its ends: something changed between reading the rows and now. */
export class AddOnClosureChangedError extends Error {
  constructor(businessId: string) {
    super(`An add-on of business ${businessId} changed while its account was closing.`);
    this.name = "AddOnClosureChangedError";
  }
}

/**
 * Records the ends the provider has already carried out, inside the closure's transaction and under the business's
 * billing lock. The customer closed the account, so no staff member is named. A row a webhook has moved on in the
 * meantime is simply skipped by its write. Before it returns, the business's rows are read again under the lock: if any
 * still needs ending (a payment landed, or a checkout was opened, after the plan was made) the closure is rolled back
 * with AddOnClosureChangedError rather than closed with an add-on the provider is still billing. The provider was never
 * told about that row, and the customer retries.
 */
export async function recordAddOnClosure(
  tx: ScopedTransaction,
  businessId: string,
  steps: readonly AddOnClosureStep[],
  now: Date,
): Promise<void> {
  await lockBusinessForBilling(tx, businessId);
  for (const { row, action } of steps) {
    switch (action) {
      case "end-at-period-end":
        await scheduleAddOnEnd(tx, { id: row.id, kind: "cancel", now, staffUserId: null });
        break;
      case "switch-to-cancel":
        await changeAddOnEndKind(tx, { id: row.id, kind: "cancel", now, staffUserId: null });
        break;
      case "cancel-now":
        await markAddOnCancelled(tx, row.id, now);
        break;
      default: {
        const unhandled: never = action;
        throw new Error(`Unhandled add-on closure action ${String(unhandled)}`);
      }
    }
  }
  if (planAddOnClosure(await listAddOnSubscriptionsForBusiness(tx, businessId)).length > 0) {
    throw new AddOnClosureChangedError(businessId);
  }
}

const PROVIDER_UNAVAILABLE = "We couldn't reach the payment provider. Try again in a minute.";
const INDIA_TIME = "Asia/Kolkata";

/** The sentence the Add-ons page shows for an outcome. Dates are in India time, like the rest of billing. */
export function addOnEndMessage(outcome: AddOnEndOutcome): string {
  if (outcome.kind === "refused") {
    if (outcome.addOn === null) return "We couldn't find that add-on.";
    const title = addOnById(outcome.addOn).title;
    switch (outcome.reason) {
      case "not-found":
        return "We couldn't find that add-on.";
      case "not-running":
        return `${title} isn't running, so it can't be paused or cancelled.`;
      case "already-ending": {
        const verb = outcome.endKind === "pause" ? "pause" : "stop";
        return outcome.endsOn === null
          ? `${title} is already set to ${verb}.`
          : `${title} is already set to ${verb} on ${formatCalendarDate(outcome.endsOn, INDIA_TIME)}.`;
      }
      case "provider-unavailable":
        return PROVIDER_UNAVAILABLE;
      case "changed-meanwhile":
        return `Something changed while we were updating ${title}. Please check the page and try again.`;
      default: {
        const unhandled: never = outcome.reason;
        throw new Error(`Unhandled add-on end refusal ${String(unhandled)}`);
      }
    }
  }
  const title = addOnById(outcome.addOn).title;
  const date = formatCalendarDate(outcome.endsOn, INDIA_TIME);
  return outcome.endKind === "cancel" ? `${title} will stop on ${date}. You won't be charged again.` : `${title} will pause on ${date}.`;
}
