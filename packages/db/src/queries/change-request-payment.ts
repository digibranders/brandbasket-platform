import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { changeRequests } from "../schema/change-requests";
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
