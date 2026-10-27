import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { changeRequests } from "../schema/change-requests";
import { charges } from "../schema/billing";
import { lockBusinessForBilling } from "./billing";
import type { ScopedTransaction } from "../scope";

/**
 * A paid `change_hours` charge starts the change request it was opened for: quoted becomes in progress. Called inside
 * recordChargePayment, in the payment's own transaction, so the money and the start never disagree. A charge that
 * staff added by hand has no request, and a request that has moved on is left alone. True when a request was started.
 */
export async function startPaidChangeRequest(db: Database | ScopedTransaction, chargeId: string): Promise<boolean> {
  const rows = await db
    .update(changeRequests)
    .set({ state: "in_progress" })
    .where(and(eq(changeRequests.chargeId, chargeId), eq(changeRequests.state, "quoted")))
    .returning({ id: changeRequests.id });
  return rows.length > 0;
}

/**
 * Lets go of the open `change_hours` charges of the change requests an account erasure is about to delete (the requests of
 * the business, and those on tickets the erased person sent), so a payment that arrives later finds nothing to pay and
 * starts no work. Takes the locks a payment takes (business, then charge) and runs in the erasure's own transaction.
 */
export async function waiveChangeChargesForErasure(tx: ScopedTransaction, input: { readonly userId: string; readonly businessId: string; readonly now: Date }): Promise<void> {
  await lockBusinessForBilling(tx, input.businessId);
  await tx
    .update(charges)
    .set({ status: "waived", waivedAt: input.now })
    .where(
      and(
        eq(charges.kind, "change_hours"),
        eq(charges.status, "open"),
        sql`${charges.id} in (
          select r.charge_id from change_requests r join support_tickets t on t.id = r.ticket_id
          where r.charge_id is not null and (r.business_id = ${input.businessId} or t.requester_user_id = ${input.userId}))`,
      ),
    );
}
