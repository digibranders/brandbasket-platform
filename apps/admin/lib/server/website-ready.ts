import "server-only";
import { findDealForBusiness, findOpenProjectForStaff, markLinkReady, paymentLinkState, unmarkLinkReady, type Database } from "@brandbasket/db";
import { recordStaffAction } from "./activity";
import { sendBalanceDue } from "./payment-emails";
import type { GrantedStaff } from "./staff-access";

/*
 * Plan 66, step 5: staff press "Website ready" on a paid deal once the customer has approved the preview. The customer is then asked to
 * pay the balance and the first period of the plan, and the site can go live after that. "Undo ready" takes it back while the balance
 * is unpaid.
 */

export type WebsiteReadyOutcome = "ready" | "no-deal" | "not-approved" | "not-building";
export type WebsiteReadyUndoOutcome = "undone" | "not-ready";

/**
 * Marks the business's paid deal ready. Refused unless the deal is building (advance paid, not already ready, not paid or cancelled) and
 * the open project is approved. The state change is one conditional update (markLinkReady), so two presses mark it once. Records the
 * action, then tells the customer (bell and email); the send is best-effort and never undoes the mark.
 */
export async function markWebsiteReady(db: Database, input: { readonly businessId: string; readonly staff: GrantedStaff; readonly now: Date }): Promise<WebsiteReadyOutcome> {
  const link = await findDealForBusiness(db, input.businessId);
  if (link === null || link.dealType !== "paid") return "no-deal";
  if (paymentLinkState(link, input.now) !== "building") return "not-building";
  const project = await findOpenProjectForStaff(db, input.businessId);
  if (project === null || project.status !== "approved") return "not-approved";
  if (!(await markLinkReady(db, { linkId: link.id, staffUserId: input.staff.user.id, now: input.now }))) return "not-building";
  await recordStaffAction(input.staff, { businessId: input.businessId, kind: "payment_link.ready", summary: "Marked the website ready: the balance is due", data: { linkId: link.id } });
  if (link.setupFeeListCents !== null && link.advanceCents !== null) {
    await sendBalanceDue({
      businessId: input.businessId,
      linkId: link.id,
      readyAt: input.now,
      currency: link.currency,
      balanceCents: link.setupFeeListCents - (link.setupFeeDiscountCents ?? 0) - link.advanceCents,
      reminder: false,
    });
  }
  return "ready";
}

/** Takes "Website ready" back while the balance is unpaid, so staff can edit the deal again. */
export async function undoWebsiteReady(db: Database, input: { readonly businessId: string; readonly staff: GrantedStaff }): Promise<WebsiteReadyUndoOutcome> {
  const link = await findDealForBusiness(db, input.businessId);
  if (link === null || link.readyAt === null || !(await unmarkLinkReady(db, { linkId: link.id }))) return "not-ready";
  await recordStaffAction(input.staff, { businessId: input.businessId, kind: "payment_link.ready_undone", summary: "Took back Website ready", data: { linkId: link.id } });
  return "undone";
}
