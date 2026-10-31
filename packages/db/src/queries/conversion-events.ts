import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { conversionEvents, type ConversionDestination } from "../schema";

/** A claim whose sender never reported back (the process stopped mid-send) can be taken again after this long. */
const STALE_CLAIM_MINUTES = 15;
/** A failed send is tried again for a week, up to this many times in all. */
export const MAX_CONVERSION_ATTEMPTS = 5;
const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Takes a payment's destination for sending (plan 59): true for the one caller that got it, false when it is already taken,
 * sent or skipped. A failed one, and one claimed more than a quarter of an hour ago and never finished, are taken again.
 * Staff connection.
 */
export async function claimConversionEvent(db: Database, paymentId: string, destination: ConversionDestination): Promise<boolean> {
  const taken = await db
    .insert(conversionEvents)
    .values({ paymentId, destination })
    .onConflictDoUpdate({
      target: [conversionEvents.paymentId, conversionEvents.destination],
      set: { status: "pending", updatedAt: sql`now()` },
      setWhere: or(
        eq(conversionEvents.status, "failed"),
        and(eq(conversionEvents.status, "pending"), lt(conversionEvents.updatedAt, sql`now() - interval '${sql.raw(String(STALE_CLAIM_MINUTES))} minutes'`)),
      ),
    })
    .returning({ paymentId: conversionEvents.paymentId });
  return taken.length === 1;
}

/** Records how a claimed send ended. Every call counts as an attempt. Staff connection. */
export async function markConversionEvent(
  db: Database,
  paymentId: string,
  destination: ConversionDestination,
  outcome: { readonly status: "sent" } | { readonly status: "skipped" | "failed"; readonly reason: string },
): Promise<void> {
  await db
    .update(conversionEvents)
    .set({ status: outcome.status, reason: "reason" in outcome ? outcome.reason.slice(0, 200) : null, attempts: sql`${conversionEvents.attempts} + 1`, updatedAt: sql`now()` })
    .where(and(eq(conversionEvents.paymentId, paymentId), eq(conversionEvents.destination, destination)));
}

/** The payments with a failed send still worth trying again: fewer than five attempts, and started less than a week before `now`. Staff connection. */
export async function listRetryableConversionPayments(db: Database, now: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ paymentId: conversionEvents.paymentId })
    .from(conversionEvents)
    .where(and(eq(conversionEvents.status, "failed"), lt(conversionEvents.attempts, MAX_CONVERSION_ATTEMPTS), gt(conversionEvents.createdAt, new Date(now.getTime() - RETRY_WINDOW_MS))));
  return rows.map((row) => row.paymentId);
}
