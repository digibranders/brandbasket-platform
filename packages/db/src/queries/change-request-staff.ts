import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { canMoveChange } from "../change-states";
import { changeRequests, type ChangeRequest } from "../schema/change-requests";
import { charges } from "../schema/billing";
import { staffMembers } from "../schema/staff";
import { withUserScope, type ScopedTransaction } from "../scope";
import { lockBusinessForBilling } from "./billing";
import { ChangeRequestError, countIncludedEdits, toChangeView, type ChangeView } from "./change-requests";
import { findChargeForBusiness, insertCharge, waiveCharge } from "./charges";

/* Staff and system writes. Every one runs on the staff connection, takes the staff member's id from the signed-in session
 * (never from a form), and leaves the rules to change_requests_guard: these functions add the friendly refusals. */

async function assertActiveStaff(tx: ScopedTransaction, staffId: string): Promise<void> {
  const [staff] = await tx.select({ id: staffMembers.userId }).from(staffMembers).where(and(eq(staffMembers.userId, staffId), eq(staffMembers.active, true))).limit(1);
  if (staff === undefined) throw new ChangeRequestError("forbidden", "An active staff account is required.");
}

/**
 * Locks a request for a change, in the order a payment takes its locks: business, then the open charge, then the request.
 * recordChargePayment locks the charge and then starts the request, so a quote that is replaced or declined must lock the
 * charge before the request or the two can wait on each other. The business lock keeps the charge link from changing
 * between the unlocked read and the locked one.
 */
async function lockRequest(tx: ScopedTransaction, requestId: string): Promise<ChangeRequest> {
  const [found] = await tx
    .select({ businessId: changeRequests.businessId, chargeId: changeRequests.chargeId })
    .from(changeRequests)
    .where(eq(changeRequests.id, requestId))
    .limit(1);
  if (found === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
  await lockBusinessForBilling(tx, found.businessId);
  if (found.chargeId !== null) await tx.select({ id: charges.id }).from(charges).where(eq(charges.id, found.chargeId)).limit(1).for("update");
  const [row] = await tx.select().from(changeRequests).where(eq(changeRequests.id, requestId)).for("update").limit(1);
  if (row === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
  return row;
}

/** Gives back the charge a quote opened if the customer has not paid it, so a quote that is changed or closed leaves nothing to pay. */
async function releaseOpenCharge(tx: ScopedTransaction, row: ChangeRequest, staffId: string, now: Date): Promise<void> {
  if (row.chargeId === null) return;
  await waiveCharge(tx, { chargeId: row.chargeId, businessId: row.businessId, staffId, now });
}

const NO_QUOTE = {
  quoteWhat: null,
  quoteHours: null,
  quoteUnitCents: null,
  quoteAmountCents: null,
  quoteCurrency: null,
  quoteWorkingDays: null,
  quotedAt: null,
} as const;

export interface StartWithoutQuoteInput {
  readonly requestId: string;
  readonly staffId: string;
  /** `included` uses one of the month's included edits (website changes only); `free` uses none. */
  readonly coverage: "included" | "free";
  /** The window of the month a request counts in, from the day it was sent. Pass monthBoundsIst from @brandbasket/shared. */
  readonly windowFor: (sentAt: Date) => { readonly from: Date; readonly to: Date };
  /** How many included edits the business has in a month (0 when its plan has no website). */
  readonly allowedPerMonth: number;
}

/**
 * Starts the work with no quote: the change is covered by an included edit, or free. Counting the included edits and
 * starting happen under one lock per business, so two staff members starting two requests at once cannot both take the
 * last edit. Works from "requested", and from a quote the customer has not accepted yet (the quote is dropped).
 */
export async function startChangeWithoutQuote(db: Database, input: StartWithoutQuoteInput): Promise<ChangeView> {
  return withUserScope(db, input.staffId, async (tx) => {
    await assertActiveStaff(tx, input.staffId);
    const row = await lockRequest(tx, input.requestId);
    const open = row.state === "requested" || (row.state === "quoted" && row.acceptedAt === null);
    if (!open) throw new ChangeRequestError("wrong_state", "Only a request still waiting for an answer can be started this way.");
    if (input.coverage === "included") {
      if (row.kind !== "website") throw new ChangeRequestError("not_website", "Only a website change can use an included edit.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`change-included:${row.businessId}`}, 0))`);
      const used = await countIncludedEdits(tx, row.businessId, input.windowFor(row.createdAt));
      if (used >= input.allowedPerMonth) throw new ChangeRequestError("no_included_left", "This business has no included edits left in the month the request was sent.");
    }
    const [updated] = await tx.update(changeRequests).set({ coverage: input.coverage, state: "in_progress", ...NO_QUOTE }).where(eq(changeRequests.id, row.id)).returning();
    if (updated === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
    return toChangeView(updated, null);
  });
}

export interface SendQuoteInput {
  readonly requestId: string;
  readonly staffId: string;
  /** What the quote is for, in words the customer reads: "New page". */
  readonly what: string;
  /** Whole hours, 1 to 40. */
  readonly hours: number;
  /** Working days from the customer's yes to "ready to check", 1 to 30. */
  readonly workingDays: number;
  /** The hour's price, GST included, in paise (from the plan: chargePricing). */
  readonly unitCents: number;
  readonly currency: "USD" | "INR";
  readonly now: Date;
}

/**
 * Sends a quote, or replaces the one already sent. Replacing a quote the customer had accepted gives back the charge it
 * opened (if still unpaid) and starts again from "quoted".
 */
export async function sendChangeQuote(db: Database, input: SendQuoteInput): Promise<ChangeView> {
  const what = input.what.trim();
  if (what.length < 3 || what.length > 80) throw new ChangeRequestError("invalid_input", "Say what the quote is for in 3 to 80 characters.");
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 40) throw new ChangeRequestError("invalid_input", "A quote is for 1 to 40 whole hours.");
  if (!Number.isInteger(input.workingDays) || input.workingDays < 1 || input.workingDays > 30) throw new ChangeRequestError("invalid_input", "Working days must be 1 to 30.");
  if (!Number.isSafeInteger(input.unitCents) || input.unitCents < 1) throw new ChangeRequestError("invalid_input", "The hour's price must be a whole number of paise, at least 1.");
  return withUserScope(db, input.staffId, async (tx) => {
    await assertActiveStaff(tx, input.staffId);
    const row = await lockRequest(tx, input.requestId);
    if (row.state !== "requested" && row.state !== "quoted") throw new ChangeRequestError("wrong_state", "A quote can be sent only before the work has started.");
    await releaseOpenCharge(tx, row, input.staffId, input.now);
    const [updated] = await tx
      .update(changeRequests)
      .set({
        coverage: "paid",
        state: "quoted",
        quoteWhat: what,
        quoteHours: input.hours,
        quoteUnitCents: input.unitCents,
        quoteAmountCents: input.hours * input.unitCents,
        quoteCurrency: input.currency,
        quoteWorkingDays: input.workingDays,
        quotedAt: input.now,
        acceptedAt: null,
        chargeId: null,
      })
      .where(eq(changeRequests.id, row.id))
      .returning();
    if (updated === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
    return toChangeView(updated, null);
  });
}

/** The moves staff make by hand once work is under way. Starting and quoting have their own functions. */
export type StaffMove = "preview" | "shipped" | "declined";

export interface MoveAsStaffInput {
  readonly requestId: string;
  readonly staffId: string;
  readonly to: StaffMove;
  /** Required to decline: the customer reads it. */
  readonly reason?: string;
  readonly now: Date;
}

/** Send for checking (`preview`), mark done (`shipped`), or decline with a reason. Declining gives back an unpaid charge. */
export async function moveChangeAsStaff(db: Database, input: MoveAsStaffInput): Promise<ChangeView> {
  const reason = input.reason?.trim() ?? "";
  if (input.to === "declined" && (reason.length < 3 || reason.length > 300)) throw new ChangeRequestError("invalid_input", "Say why in 3 to 300 characters.");
  return withUserScope(db, input.staffId, async (tx) => {
    await assertActiveStaff(tx, input.staffId);
    const row = await lockRequest(tx, input.requestId);
    if (!canMoveChange(row.state, input.to) || row.state === input.to) throw new ChangeRequestError("wrong_state", `A request that is ${row.state.replaceAll("_", " ")} cannot go to ${input.to.replaceAll("_", " ")}.`);
    if (input.to === "declined") await releaseOpenCharge(tx, row, input.staffId, input.now);
    const [updated] = await tx
      .update(changeRequests)
      .set({ state: input.to, closedReason: input.to === "declined" ? reason : null })
      .where(eq(changeRequests.id, row.id))
      .returning();
    if (updated === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
    return toChangeView(updated, null);
  });
}

export interface AcceptQuoteInput {
  readonly requestId: string;
  /** From the signed-in customer's session, never from the request. */
  readonly businessId: string;
  /** The plan's GST rate, recorded on the charge. */
  readonly taxRateBasisPoints: number;
  readonly now: Date;
}

/**
 * The customer's yes: turns the quote into a `change_hours` charge for them to pay. Pressing it twice (a double click,
 * two tabs) gives the same charge; if staff waived that charge meanwhile, a new one is opened. The work starts when the
 * charge is paid (startPaidChangeRequest). Staff connection, after the caller has proved the customer belongs to the business.
 */
export async function acceptChangeQuote(db: Database, input: AcceptQuoteInput): Promise<{ readonly chargeId: string; readonly opened: boolean }> {
  return db.transaction(async (tx) => {
    await lockBusinessForBilling(tx, input.businessId);
    const [row] = await tx
      .select()
      .from(changeRequests)
      .where(and(eq(changeRequests.id, input.requestId), eq(changeRequests.businessId, input.businessId)))
      .for("update")
      .limit(1);
    if (row === undefined) throw new ChangeRequestError("not_found", "The change request could not be found.");
    const quote = toChangeView(row, null).quote;
    if (row.state !== "quoted" || row.coverage !== "paid" || quote === null) throw new ChangeRequestError("wrong_state", "There is no quote to accept.");
    if (row.chargeId !== null) {
      const existing = await findChargeForBusiness(tx, input.businessId, row.chargeId);
      if (existing !== null && existing.status === "open") return { chargeId: existing.id, opened: false };
    }
    const charge = await insertCharge(tx, {
      businessId: input.businessId,
      kind: "change_hours",
      description: `Extra change hours: ${quote.what}`,
      quantity: quote.hours,
      unitAmountCents: quote.unitCents,
      taxRateBasisPoints: input.taxRateBasisPoints,
      amountCents: quote.amountCents,
      currency: quote.currency,
      createdByStaffId: null,
    });
    await tx.update(changeRequests).set({ acceptedAt: input.now, chargeId: charge.id }).where(eq(changeRequests.id, row.id));
    return { chargeId: charge.id, opened: true };
  });
}
